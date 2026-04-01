import { useState, useEffect, useMemo } from 'react';
import { X, Calculator, FileText, User, CheckCircle2, Mail, MessageSquare, MessageCircle, Smartphone } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { formatIndianCurrency, formatFullIndianAmount, numberToIndianWords } from '../utils/numberToWords';
import { usePropertyConfig } from '../context/PropertyConfigContext';
import { renderValue } from '../utils/renderUtils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import smsService from '../services/smsService';

const AddQuoteModal = ({ isOpen, onClose, deal, onSave }) => {
    usePropertyConfig();
    const [loading, setLoading] = useState(false);
    const [collectorRates, setCollectorRates] = useState([]);
    const [globalConfigs, setGlobalConfigs] = useState([]);
    const [ , setLoadingSettings] = useState(false);
    const [leads, setLeads] = useState([]);
    const [leadSearch, setLeadSearch] = useState('');
    const [isSearchingLeads, setIsSearchingLeads] = useState(false);
    const [showLeadResults, setShowLeadResults] = useState(false);
    const [selectedLead, setSelectedLead] = useState(null);

    const [formData, setFormData] = useState({
        buyerType: 'Male',
        collectorRateId: '',
        revenueRuleId: '',
        customPrice: 0,
        gstPercent: 18,
        includeGst: true,
        tdsPercent: 1,
        includeTds: true,
        includeBrokerage: true,
        brokeragePercent: 1,
        sendingMedium: 'WhatsApp' // WhatsApp, Email, SMS, RCS
    });

    // Initialize form with deal data
    useEffect(() => {
        if (deal) {
            setFormData(prev => ({
                ...prev,
                customPrice: deal.price || 0,
                buyerType: deal.buyerType || 'Male'
            }));
            if (deal.associatedContact) {
                setSelectedLead({
                    _id: deal.associatedContact._id,
                    name: deal.associatedContact.name,
                    mobile: deal.associatedContact.phone
                });
            }
        }
    }, [deal, isOpen]);

    // Fetch settings data
    useEffect(() => {
        if (!isOpen) return;

        const fetchSettings = async () => {
            setLoadingSettings(true);
            try {
                // Fetch collector rates with specific filters
                const rateParams = new URLSearchParams();
                const categoryStr = renderValue(deal?.category, '');
                const subCategoryStr = renderValue(deal?.subCategory, '');

                if (categoryStr) rateParams.append('category', categoryStr);
                if (subCategoryStr) rateParams.append('subCategory', subCategoryStr);

                // Filtering based on strict alignment (State, City, Location, Category, SubCategory, UnitType, BuiltupType)
                const inventory = deal?.inventoryId || {};
                const stateId = deal?.projectId?.address?.state?._id || inventory.address?.state?._id;
                const districtId = deal?.projectId?.address?.district?._id || inventory.address?.district?._id;
                const cityStr = deal?.projectId?.address?.city || inventory.city || '';
                const unitTypeStr = renderValue(deal?.unitType || inventory.unitType, '');
                const builtupTypeStr = renderValue(inventory.builtupType, '');

                if (stateId) rateParams.append('state', stateId);
                if (districtId) rateParams.append('district', districtId);
                if (unitTypeStr) rateParams.append('unitType', unitTypeStr);
                if (builtupTypeStr) rateParams.append('builtupType', builtupTypeStr);
                if (cityStr) rateParams.append('search', cityStr); // Backend controller uses 'search' for general city/location matching

                let ratesRes = await api.get(`/collector-rates?${rateParams.toString()}&limit=50`);

                // Fallback: If no specific match, try fetching more general rates
                if (ratesRes.data?.status === 'success' && (!ratesRes.data.data.docs || ratesRes.data.data.docs.length === 0)) {
                    // Try without category/subcategory or just fetch all available
                    ratesRes = await api.get(`/collector-rates?limit=100`);
                }

                if (ratesRes.data?.status === 'success') {
                    const rates = ratesRes.data.data.docs || [];
                    setCollectorRates(rates);
                    if (rates.length > 0) {
                        setFormData(prev => ({ ...prev, collectorRateId: rates[0]._id }));
                    }
                }

                // Fetch global configs (revenue rules)
                const configRes = await api.get('/system-settings?category=govt_charges_config');
                if (configRes.data?.status === 'success') {
                    const docs = Array.isArray(configRes.data.data) ? configRes.data.data : (configRes.data.data.docs || []);
                    setGlobalConfigs(docs);
                    if (docs.length > 0) {
                        setFormData(prev => ({ ...prev, revenueRuleId: docs[0]._id }));
                    }
                }
            } catch (error) {
                console.error("Failed to fetch settings for quote:", error);
                toast.error("Failed to load some settings");
            } finally {
                setLoadingSettings(false);
            }
        };

        fetchSettings();
    }, [isOpen, deal]);

    // Debounced lead search
    useEffect(() => {
        if (!leadSearch.trim()) {
            setLeads([]);
            return;
        }

        const fetchLeads = async () => {
            setIsSearchingLeads(true);
            try {
                const response = await api.get(`leads`, {
                    params: { search: leadSearch, limit: 10 }
                });
                if (response.data?.success) {
                    setLeads(response.data.records || []);
                }
            } catch (error) {
                console.error("Lead search failed:", error);
            } finally {
                setIsSearchingLeads(false);
            }
        };

        const timer = setTimeout(fetchLeads, 500);
        return () => clearTimeout(timer);
    }, [leadSearch]);

    const selectedCollectorRate = useMemo(() =>
        collectorRates.find(r => r._id === formData.collectorRateId),
        [collectorRates, formData.collectorRateId]);

    const selectedRevenueRule = useMemo(() =>
        globalConfigs.find(c => c._id === formData.revenueRuleId)?.value,
        [globalConfigs, formData.revenueRuleId]);

    // Calculations logic similar to DealDetailPage
    const quoteCalculations = useMemo(() => {
        if (!deal) return null;

        const basePrice = parseFloat(formData.customPrice) || 0;
        let collectorValue = 0;
        let stampDutyPercent = 7;
        let registrationPercent = 1;
        let legalFees = 15000;

        // Apply Revenue Rule (Global Config)
        if (selectedRevenueRule) {
            if (formData.buyerType === 'Female') stampDutyPercent = selectedRevenueRule.stampDutyFemale || 5;
            else if (formData.buyerType === 'Joint') stampDutyPercent = selectedRevenueRule.stampDutyJoint || 6;
            else stampDutyPercent = selectedRevenueRule.stampDutyMale || 7;

            registrationPercent = selectedRevenueRule.registrationPercent || 1;
            legalFees = selectedRevenueRule.legalFees || 15000;
        }

        // Apply Collector Rate
        if (selectedCollectorRate) {
            const inventory = deal.inventoryId || {};
            const area = selectedCollectorRate.rateApplyOn === 'Built-up Area'
                ? (inventory.builtUpArea?.value || inventory.builtUpArea || 0)
                : (inventory.totalArea || inventory.area || 0);

            // Basic multiplier logic (simplified for modal, could be expanded)
            let multiplier = 1;
            // Add road/floor multiplier logic if needed

            collectorValue = selectedCollectorRate.rate * area * multiplier;
        }

        const applicableValue = Math.max(basePrice, collectorValue) || 0;
        const stampDutyAmount = (applicableValue * (stampDutyPercent / 100)) || 0;
        const registrationAmount = (applicableValue * (registrationPercent / 100)) || 0;
        const gstAmount = formData.includeGst ? ((basePrice * (formData.gstPercent / 100)) || 0) : 0;
        const tdsAmount = formData.includeTds ? ((basePrice * (formData.tdsPercent / 100)) || 0) : 0;
        const brokerageAmount = formData.includeBrokerage ? ((basePrice * (formData.brokeragePercent / 100)) || 0) : 0;

        const totalGovtCharges = (stampDutyAmount + registrationAmount + (legalFees || 0)) || 0;
        const netPayable = (basePrice + totalGovtCharges + gstAmount + brokerageAmount - tdsAmount) || 0;

        return {
            basePrice,
            collectorValue,
            applicableValue,
            stampDutyPercent,
            stampDutyAmount,
            registrationAmount,
            gstAmount,
            tdsAmount,
            brokerageAmount,
            totalGovtCharges,
            netPayable,
            legalFees
        };
    }, [deal, formData, selectedCollectorRate, selectedRevenueRule]);

    const handleSave = async (generateOnly = true) => {
        if (!deal || !quoteCalculations) {
            toast.error("Quotation data not ready. Please check form fields.");
            return;
        }

        setLoading(true);
        try {
            console.log("Starting Quote Generation...", { generateOnly, dealId: deal._id });

            // 1. Generate PDF
            let pdfDoc;
            try {
                pdfDoc = await generateQuotationPDF();
            } catch (pdfErr) {
                console.error("PDF Generation failed internal:", pdfErr);
                throw new Error(`PDF Generation failed: ${pdfErr.message}`);
            }

            const pdfBlob = pdfDoc.output('blob');
            const pdfFile = new File([pdfBlob], `Quotation_${deal.unitNo || 'Unit'}.pdf`, { type: 'application/pdf' });

            // 2. Upload to Server (to get a link for WhatsApp/Email)
            let pdfUrl = '';
            const uploadFormData = new FormData();
            uploadFormData.append('file', pdfFile);

            try {
                const uploadRes = await api.post('/upload', uploadFormData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                pdfUrl = uploadRes.data.url;
                console.log("PDF Uploaded:", pdfUrl);
            } catch (err) {
                console.error("PDF Upload failed:", err);
                // Continue anyway for preview
            }

            // 3. Save Quote to Deal (Only if send or if we want to track every generation)
            const res = await api.put(`deals/${deal._id}`, {
                stage: 'Quote',
                associatedContact: selectedLead?._id,
                quotePrice: quoteCalculations.basePrice || 0,
                calculations: quoteCalculations,
                quoteUrl: pdfUrl
            });

            if (res.data?.success) {
                // 4. Send via selected Medium
                if (!generateOnly && selectedLead?.mobile) {
                    await sendQuotation(pdfUrl);
                }

                toast.success(generateOnly ? "Quote generated successfully!" : `Quote sent via ${formData.sendingMedium}!`);

                // Trigger download for user reference
                pdfDoc.save(`Quotation_${deal.unitNo || 'Unit'}.pdf`);

                onSave && onSave(res.data.data);
                if (!generateOnly) onClose();
            } else {
                throw new Error(res.data?.message || "Failed to update deal with quote info");
            }
        } catch (error) {
            console.error("Quote operation failed:", error);
            toast.error(error.message || "Operation failed. See console for details.");
        } finally {
            setLoading(false);
        }
    };

    const generateQuotationPDF = async () => {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // 🏵️ --- TOP CENTER BRANDING (Jai Mata Di) ---
        doc.setTextColor(220, 38, 38); // Red
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text("Jai Mata Di", pageWidth / 2, 10, { align: 'center' });

        // 🏢 --- MAIN COMPANY HEADER ---
        doc.setTextColor(15, 23, 42); // Navy
        doc.setFontSize(24);
        doc.setFont('times', 'bold');
        doc.text("BHARAT PROPERTIES", pageWidth / 2, 22, { align: 'center' });

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text("Mob: +91 99910 00570, 99913 33570 | Email: bharatproperties570@gmail.com", pageWidth / 2, 28, { align: 'center' });

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text("Office: 166, Sec 3, Huda Mkt., Kurukshetra, Haryana - 136118", pageWidth / 2, 33, { align: 'center' });

        // Decorative Line under header
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(15, 38, pageWidth - 15, 38);

        // 🏷️ --- QUOTE HEADER ---
        let currentY = 55;

        doc.setFillColor(15, 23, 42);
        doc.rect(15, currentY - 2, 60, 0.5, 'F');

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text("PROPERTY ACQUISITION QUOTATION", 15, currentY + 5);

        // Ref ID & Date (Right aligned)
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`REF NO: BP/QTN/${new Date().getFullYear()}/${Math.floor(Math.random() * 900) + 100}`, pageWidth - 15, currentY, { align: 'right' });
        doc.text(`ISSUE DATE: ${new Date().toLocaleDateString('en-IN')}`, pageWidth - 15, currentY + 5, { align: 'right' });

        currentY += 20;

        // 👤 --- CLIENT SUMMARY ---
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text("VALUED PROSPECT", 15, currentY);

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(selectedLead?.name || 'Titled Client', 15, currentY + 8);

        doc.setTextColor(71, 85, 105);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Mobile: ${selectedLead?.mobile || 'Not Specified'}`, 15, currentY + 14);
        doc.text(`Client Type: Individual (${formData.buyerType})`, 15, currentY + 20);

        // 🏛️ --- PROPERTY SNAPSHOT ---
        const rightColX = pageWidth / 2 + 10;
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text("INVENTORY SPECIFICATIONS", rightColX, currentY);

        doc.setTextColor(37, 99, 235); // Accent Blue
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`${deal.projectName || 'Premium Development'}`, rightColX, currentY + 8);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(`Unit Number: ${deal.unitNo} | Status: ${deal.subCategory}`, rightColX, currentY + 14);

        doc.setTextColor(100, 116, 139);
        doc.text(`Category: ${deal.category} Real Estate`, rightColX, currentY + 20);
        doc.text(`Plot/Unit Size: ${deal.sizeLabel || deal.size || 'Standard'}`, rightColX, currentY + 26);

        // 📉 --- FINANCIAL BREAKDOWN (Professional Table) ---
        currentY += 40;
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text("Investment Details & Regulatory Charges", 15, currentY);

        // Table Data Preparation
        const tableData = [
            ["Description of Charges", "Computation Basis", "Amount (₹)"],
            ["Total Basic Sale Value", "As per Master Pricing", formatFullIndianAmount(quoteCalculations?.basePrice || 0)],
            [`Estimated Stamp Duty (${quoteCalculations?.stampDutyPercent || 0}%)`, "Statutory Regulatory Levy", formatFullIndianAmount(quoteCalculations?.stampDutyAmount || 0)],
            ["Government Registration Fees", "Fixed Document Charges", formatFullIndianAmount(quoteCalculations?.registrationAmount || 0)],
            ["Legal & Admin Documentation", "Standard Processing", formatFullIndianAmount(quoteCalculations?.legalFees || 0)]
        ];

        if (formData.includeGst) {
            tableData.push([`GST Compliance (18%)`, "Input Tax Liability", formatFullIndianAmount(quoteCalculations?.gstAmount || 0)]);
        }
        if (formData.includeTds) {
            tableData.push(["TDS Deductible (1%)", "Income Tax Compliance", `${formatFullIndianAmount(quoteCalculations?.tdsAmount || 0)}`]);
        }

        autoTable(doc, {
            startY: currentY + 5,
            head: [tableData[0]],
            body: tableData.slice(1),
            theme: 'striped',
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [255, 255, 255],
                fontSize: 9,
                fontStyle: 'bold'
            },
            bodyStyles: {
                textColor: [30, 41, 59],
                fontSize: 9,
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: 75 },
                1: { cellWidth: 'auto' },
                2: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42], cellWidth: 45 }
            },
            didParseCell: function (data) {
                // Ensure the Amount (INR) header is specifically right-aligned to match the data underneath
                if (data.section === 'head' && data.column.index === 2) {
                    data.cell.styles.halign = 'right';
                }
            },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            margin: { left: 15, right: 15 }
        });

        // 💰 --- TOTAL HIGHLIGHT ---
        let finalY = doc.lastAutoTable.finalY + 12;

        doc.setFillColor(248, 250, 252);
        doc.rect(15, finalY, pageWidth - 30, 30, 'F');
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(1);
        doc.line(15, finalY, 15, finalY + 30); // Left accent line

        doc.setTextColor(71, 85, 105);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text("NET LANDED COST ESTIMATE (NET PAYABLE)", 22, finalY + 10);

        const totalAmountStr = formatFullIndianAmount(quoteCalculations?.netPayable || 0);
        doc.setTextColor(37, 99, 235);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text(totalAmountStr, pageWidth - 20, finalY + 22, { align: 'right' });

        // Amount in words
        const wordString = numberToIndianWords(quoteCalculations?.netPayable || 0);
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`In Words: Rupees ${wordString} Only`, 22, finalY + 22);

        // 📋 --- TERMS & COMPLIANCE ---
        finalY += 45;
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text("Standard Terms of Business", 15, finalY);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);

        const terms = [
            "Quotation Validity: This estimate is valid for a period of 7 business days from the date of issue.",
            "Statutory Adjustments: All government charges (GST, Stamp Duty etc.) are as per current laws and are subject to change.",
            "Verification: Prospective buyers are requested to verify all property titles and dimensions from physical records.",
            "Disclaimer: Bharat Properties acts as a facilitator. Final transaction is subject to developer and regulatory approvals."
        ];

        terms.forEach((t, i) => doc.text(`- ${t}`, 15, finalY + i * 5 + 6));

        // 🏢 --- LETTERHEAD FOOTER ELEMENTS ---
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'italic');
        doc.text("HONEST & FAIR DEAL IS OUR MOTTO", pageWidth / 2, pageHeight - 15, { align: 'center' });

        return doc;
    };

    const sendQuotation = async (pdfUrl) => {
        if (!selectedLead?.mobile) return;

        const message = `Hello ${selectedLead.name},\n\nPlease find your professional quotation for ${deal.projectName} Unit ${deal.unitNo}.\n\nView Document: ${pdfUrl || 'Check email for attachment'}\n\nThank you,\nBharat Properties`;

        const payload = {
            channel: formData.sendingMedium?.toUpperCase(),
            recipients: [{ name: selectedLead.name, phone: selectedLead.mobile }],
            content: {
                body: message,
                referenceType: 'Quotation',
                pdfUrl: pdfUrl
            }
        };

        try {
            await smsService.sendMessage(payload);
        } catch (err) {
            console.error("Sending failed:", err);
            toast.error(`Failed to send via ${formData.sendingMedium}`);
        }
    };

    if (!isOpen) return null;

    // --- Premium Styles System ---
    const styles = {
        overlay: {
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            padding: '24px',
            animation: 'fadeIn 0.3s ease-out'
        },
        container: {
            backgroundColor: '#ffffff',
            width: '94%',
            maxWidth: '1000px',
            height: '88vh',
            borderRadius: '16px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            position: 'relative',
            fontFamily: "'Outfit', 'Inter', sans-serif"
        },
        header: {
            padding: '24px 32px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#ffffff'
        },
        headerIconBox: {
            width: '42px',
            height: '42px',
            background: '#eff6ff',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563eb',
            boxShadow: 'none'
        },
        closeBtn: {
            padding: '12px',
            borderRadius: '50%',
            border: 'none',
            background: '#f1f5f9',
            color: '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
        },
        body: {
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            background: '#f8fafc',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 380px',
            gap: '24px'
        },
        sectionCard: {
            background: '#fff',
            padding: '24px',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            marginBottom: '24px'
        },
        sectionTitle: {
            fontSize: '0.9rem',
            fontWeight: 700,
            color: '#1e293b',
            textTransform: 'none',
            letterSpacing: 'normal',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
        },
        inputGroup: {
            marginBottom: '28px'
        },
        label: {
            display: 'block',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: '#64748b',
            marginBottom: '8px'
        },
        input: {
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '0.9rem',
            outline: 'none',
            color: '#1e293b',
            transition: 'border-color 0.2s',
            boxSizing: 'border-box'
        },
        select: {
            width: '100%',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            fontSize: '0.9rem',
            outline: 'none',
            color: '#1e293b',
            appearance: 'none',
            cursor: 'pointer',
            background: '#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'none\' viewBox=\'0 0 24 24\' stroke=\'%2364748b\'%3E%3Cpath stroke-linecap=\'round\' stroke-linejoin=\'round\' stroke-width=\'2\' d=\'M19 9l-7 7-7-7\' /%3E%3C/svg%3E") no-repeat right 12px center',
            backgroundSize: '16px',
            boxSizing: 'border-box'
        },
        pillContainer: {
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px'
        },
        pill: (active) => ({
            padding: '12px',
            borderRadius: '10px',
            border: `2px solid ${active ? '#2563eb' : '#e2e8f0'}`,
            backgroundColor: active ? '#eff6ff' : '#fff',
            color: active ? '#2563eb' : '#64748b',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.2s',
            textAlign: 'center'
        }),
        summaryCard: {
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '24px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            height: 'fit-content',
            position: 'sticky',
            top: 0,
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        },
        summaryRow: (isTotal = false, isGst = false, isTds = false) => ({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: isTotal ? '24px 0 0 0' : '16px 0',
            borderBottom: isTotal ? 'none' : '1px solid #e2e8f080',
            marginTop: isTotal ? '24px' : '0',
            borderTop: isTotal ? '2px dashed #cbd5e1' : 'none',
            color: isTotal ? '#1e293b' : (isGst ? '#059669' : (isTds ? '#e11d48' : '#475569'))
        }),
        footer: {
            padding: '20px 32px',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '12px'
        },
        cancelBtn: {
            padding: '10px 20px',
            borderRadius: '8px',
            border: '1px solid #cbd5e1',
            background: '#fff',
            color: '#475569',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9rem'
        },
        primaryBtn: {
            backgroundColor: '#2563eb',
            color: '#ffffff',
            padding: '10px 24px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s',
            opacity: loading ? 0.7 : 1
        }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.container}>
                {/* Header */}
                <div style={styles.header}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                        <div style={styles.headerIconBox}>
                            <Calculator size={28} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                                Professional Quotation
                            </h2>
                            <p style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
                                {renderValue(deal?.category)} • {renderValue(deal?.unitNo, 'Unit Details')} • {renderValue(deal?.projectName, 'Project')}
                            </p>
                        </div>
                    </div>
                    <button style={styles.closeBtn} onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                {/* Body */}
                <div style={styles.body}>
                    {/* Form Left Side */}
                    <div>
                        <div style={styles.sectionCard}>
                            <h3 style={styles.sectionTitle}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                                Buyer Profile Mapping
                            </h3>

                            {/* Lead Selection Section */}
                            <div style={{ marginBottom: '24px' }}>
                                <label style={styles.label}>Associated Lead / Contact</label>

                                {selectedLead ? (
                                    <div style={{ ...styles.selectedLeadBadge, display: 'flex', alignItems: 'center', gap: '15px', padding: '12px', background: '#f0f9ff', borderRadius: '12px', border: '1px solid #bae6fd' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                            <User size={20} color="#2563eb" />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{selectedLead.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>{selectedLead.mobile || 'No Mobile'}</div>
                                        </div>
                                        <button
                                            onClick={() => { setSelectedLead(null); setLeadSearch(''); }}
                                            style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', padding: '8px' }}
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            value={leadSearch}
                                            onChange={(e) => { setLeadSearch(e.target.value); setShowLeadResults(true); }}
                                            onFocus={() => setShowLeadResults(true)}
                                            style={styles.input}
                                            placeholder="Search by name or mobile..."
                                        />
                                        {isSearchingLeads && (
                                            <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)' }}>
                                                <div className="spinner-small" />
                                            </div>
                                        )}

                                        {showLeadResults && leadSearch.length > 0 && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                right: 0,
                                                backgroundColor: '#fff',
                                                borderRadius: '12px',
                                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                                border: '1px solid #e2e8f0',
                                                zIndex: 100,
                                                marginTop: '8px',
                                                maxHeight: '200px',
                                                overflowY: 'auto'
                                            }}>
                                                {leads.length > 0 ? leads.map(lead => {
                                                    const name = lead.firstName ? `${lead.salutation || ""} ${lead.firstName} ${lead.lastName || ""}`.trim() : renderValue(lead.name, "Unknown");
                                                    return (
                                                        <div
                                                            key={lead._id}
                                                            style={{
                                                                padding: '12px 16px',
                                                                cursor: 'pointer',
                                                                borderBottom: '1px solid #f1f5f9',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '2px'
                                                            }}
                                                            onClick={() => {
                                                                setSelectedLead({ _id: lead._id, name, mobile: lead.mobile });
                                                                setShowLeadResults(false);
                                                                setLeadSearch('');
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                        >
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>{name}</span>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{lead.mobile || 'N/A'} • {renderValue(lead.stage, 'New')}</span>
                                                        </div>
                                                    );
                                                }) : !isSearchingLeads && (
                                                    <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                                        No leads found for "{leadSearch}"
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div style={styles.pillContainer}>
                                {['Male', 'Female', 'Joint'].map((type) => (
                                    <div
                                        key={type}
                                        onClick={() => setFormData(prev => ({ ...prev, buyerType: type }))}
                                        style={styles.pill(formData.buyerType === type)}
                                    >
                                        {type}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={styles.sectionCard}>
                            <h3 style={styles.sectionTitle}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669' }} />
                                Valuation & Taxation
                            </h3>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Deal Base Price (₹)</label>
                                <input
                                    type="number"
                                    value={formData.customPrice}
                                    onChange={(e) => setFormData(prev => ({ ...prev, customPrice: e.target.value }))}
                                    style={styles.input}
                                    placeholder="Enter deal amount"
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div style={styles.inputGroup}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ ...styles.label, marginBottom: 0 }}>GST Calculation (%)</label>
                                        <button
                                            onClick={() => setFormData(prev => ({ ...prev, includeGst: !prev.includeGst }))}
                                            style={{
                                                padding: '4px 12px',
                                                borderRadius: '20px',
                                                fontSize: '0.7rem',
                                                fontWeight: 800,
                                                border: 'none',
                                                cursor: 'pointer',
                                                backgroundColor: formData.includeGst ? '#dcfce7' : '#f1f5f9',
                                                color: formData.includeGst ? '#166534' : '#64748b',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {formData.includeGst ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        value={formData.gstPercent}
                                        onChange={(e) => setFormData(prev => ({ ...prev, gstPercent: e.target.value }))}
                                        style={{ ...styles.input, opacity: formData.includeGst ? 1 : 0.5, cursor: formData.includeGst ? 'text' : 'not-allowed' }}
                                        disabled={!formData.includeGst}
                                    />
                                </div>
                                <div style={styles.inputGroup}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ ...styles.label, marginBottom: 0 }}>TDS Withholding (%)</label>
                                        <button
                                            onClick={() => setFormData(prev => ({ ...prev, includeTds: !prev.includeTds }))}
                                            style={{
                                                padding: '4px 12px',
                                                borderRadius: '20px',
                                                fontSize: '0.7rem',
                                                fontWeight: 800,
                                                border: 'none',
                                                cursor: 'pointer',
                                                backgroundColor: formData.includeTds ? '#dcfce7' : '#f1f5f9',
                                                color: formData.includeTds ? '#166534' : '#64748b',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {formData.includeTds ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                    <input
                                        type="number"
                                        value={formData.tdsPercent}
                                        onChange={(e) => setFormData(prev => ({ ...prev, tdsPercent: e.target.value }))}
                                        style={{ ...styles.input, opacity: formData.includeTds ? 1 : 0.5, cursor: formData.includeTds ? 'text' : 'not-allowed' }}
                                        disabled={!formData.includeTds}
                                    />
                                </div>
                            </div>
                        </div>

                        <div style={styles.sectionCard}>
                            <h3 style={styles.sectionTitle}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6366f1' }} />
                                Regulatory Framework
                            </h3>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Revenue Policy (Global Config)</label>
                                <select
                                    value={formData.revenueRuleId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, revenueRuleId: e.target.value }))}
                                    style={styles.select}
                                >
                                    <option value="">Select Revenue Rule</option>
                                    {globalConfigs.map(c => (
                                        <option key={c._id} value={c._id}>{c.value?.configName || c.key}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={styles.inputGroup}>
                                <label style={styles.label}>Collector / Circle Rate</label>
                                <select
                                    value={formData.collectorRateId}
                                    onChange={(e) => setFormData(prev => ({ ...prev, collectorRateId: e.target.value }))}
                                    style={styles.select}
                                >
                                    <option value="">Choose Local Circle Rate</option>
                                    {collectorRates.map(r => (
                                        <option key={r._id} value={r._id}>
                                            {renderValue(r.category)} - {renderValue(r.subCategory)}
                                            {r.unitType ? ` (${r.unitType})` : ''}
                                            - ₹{r.rate}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={styles.sectionCard}>
                            <h3 style={styles.sectionTitle}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                                Communication Medium
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                {['WhatsApp', 'Email', 'SMS', 'RCS'].map(medium => (
                                    <div
                                        key={medium}
                                        onClick={() => setFormData(prev => ({ ...prev, sendingMedium: medium }))}
                                        style={{
                                            ...styles.pill(formData.sendingMedium === medium),
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '8px',
                                            padding: '12px'
                                        }}
                                    >
                                        {medium === 'WhatsApp' && <MessageCircle size={16} />}
                                        {medium === 'Email' && <Mail size={16} />}
                                        {medium === 'SMS' && <MessageSquare size={16} />}
                                        {medium === 'RCS' && <Smartphone size={16} />}
                                        {medium}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Summary Right Side */}
                    <div style={styles.summaryCard}>
                        <h3 style={styles.sectionTitle}>
                            <FileText size={14} /> Economic Breakdown
                        </h3>

                        <div style={{ flex: 1 }}>
                            <div style={styles.summaryRow()}>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Quoted Price</span>
                                <span style={{ fontSize: '1rem', fontWeight: 900 }}>{formatIndianCurrency(quoteCalculations?.basePrice)}</span>
                            </div>
                            <div style={styles.summaryRow()}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Stamp Duty ({quoteCalculations?.stampDutyPercent}%)</span>
                                <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>+{formatIndianCurrency(quoteCalculations?.stampDutyAmount)}</span>
                            </div>
                            <div style={styles.summaryRow()}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Registration</span>
                                <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>+{formatIndianCurrency(quoteCalculations?.registrationAmount)}</span>
                            </div>
                            <div style={styles.summaryRow()}>
                                <span style={{ fontSize: '0.8rem', fontStyle: 'italic', color: '#94a3b8' }}>Legal & Admin Fees</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>+{formatIndianCurrency(quoteCalculations?.legalFees)}</span>
                            </div>

                            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px' }}>
                                    <span>Taxes & Levies</span>
                                </div>
                                <div style={styles.summaryRow(false, true)}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>GST ({formData.gstPercent}%)</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>+{formatIndianCurrency(quoteCalculations?.gstAmount)}</span>
                                </div>
                                <div style={styles.summaryRow(false, false, true)}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>TDS Reserve</span>
                                    <span style={{ fontSize: '0.95rem', fontWeight: 800 }}>-{formatIndianCurrency(quoteCalculations?.tdsAmount)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Total Footer */}
                        <div style={styles.summaryRow(true)}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 900, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '4px' }}>
                                    Final Payable Value
                                </div>
                                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#1e293b', tracking: '-0.04em' }}>
                                    {formatIndianCurrency(quoteCalculations?.netPayable)}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ width: '48px', height: '48px', backgroundColor: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669', marginLeft: 'auto', marginBottom: '8px' }}>
                                    <CheckCircle2 size={28} />
                                </div>
                                <div style={{ fontSize: '0.6rem', fontWeight: 900, color: '#059669', textTransform: 'uppercase' }}>Valid Quote</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Footer */}
                <div style={styles.footer}>
                    <button style={styles.cancelBtn} onClick={onClose}>
                        Cancel
                    </button>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            style={{ ...styles.primaryBtn, background: '#fff', border: '1px solid #2563eb', color: '#2563eb' }}
                            onClick={() => handleSave(true)}
                            disabled={loading || !selectedLead}
                        >
                            <FileText size={18} />
                            Preview PDF
                        </button>
                        <button
                            style={styles.primaryBtn}
                            onClick={() => handleSave(false)}
                            disabled={loading || !selectedLead}
                        >
                            <MessageCircle size={18} />
                            {loading ? 'Sending...' : 'Generate & Send'}
                        </button>
                    </div>
                </div>

                <style>
                    {`
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.98) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .spinner-small {
                    width: 20px;
                    height: 20px;
                    border: 2px solid #e2e8f0;
                    border-top-color: #2563eb;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; borderRadius: 10px; }
                `}
                </style>
            </div>
        </div>
    );
};

export default AddQuoteModal;
