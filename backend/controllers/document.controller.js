import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Lookup from "../models/Lookup.js";
import { getVisibilityFilter } from "../utils/visibility.js";

// --- Helpers ---
function formatCurrency(amount) {
    if (!amount) return '₹0';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function numberToIndianWords(num) {
    if (!num || num === 0) return 'Zero Only';
    const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    let numStr = num.toString();
    if (numStr.length > 9) return 'Overflow';
    const n = ('000000000' + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
    str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'Only' : 'Only';
    return str.trim();
}

function getContactFullName(c) {
    if (!c || Object.keys(c).length === 0) return '___________________________';
    let titleVal = c.title ? (typeof c.title === 'object' ? c.title.lookup_value || c.title.name : c.title) : '';
    const first = c.name || c.firstName || '';
    const last = c.surname || c.lastName || '';
    return `${titleVal ? titleVal + ' ' : ''}${first} ${last}`.trim() || '___________________________';
}

function formatAddress(addr, lookupsMap = {}) {
    if (!addr) return '';
    if (typeof addr === 'string') return addr;
    const resolveVal = (field) => {
        if (!field) return '';
        if (typeof field === 'object') return field.lookup_value || field.name || '';
        if (typeof field === 'string' && lookupsMap[field]) return lookupsMap[field];
        return field;
    };
    const parts = [
        addr.hNo ? `H.No. ${addr.hNo}` : '',
        addr.street ? `Street: ${addr.street}` : '',
        resolveVal(addr.location) || resolveVal(addr.area) || '',
        resolveVal(addr.tehsil) ? `Tehsil: ${resolveVal(addr.tehsil)}` : '',
        resolveVal(addr.postOffice) ? `P.O.: ${resolveVal(addr.postOffice)}` : '',
        resolveVal(addr.city) || '',
        resolveVal(addr.state) || '',
        resolveVal(addr.pincode) ? `Pincode: ${resolveVal(addr.pincode)}` : '',
        resolveVal(addr.country) || ''
    ].filter(Boolean);
    return parts.join(', ') || '';
}

function resolvePropertyField(field, lookupsMap = {}) {
    if (!field) return '___________________________';
    
    // If it's an object with lookup_value or name (fully populated)
    if (typeof field === 'object' && (field.lookup_value || field.name)) {
        return field.lookup_value || field.name;
    }

    // If it's an ObjectId object, we need to convert it to string
    if (typeof field === 'object' && field.toString) {
        const strId = field.toString();
        if (lookupsMap[strId]) return lookupsMap[strId];
        return strId; // Fallback to ID string
    }

    // If it's a string, look it up in the map
    if (typeof field === 'string' && lookupsMap[field]) return lookupsMap[field];
    
    return field;
}

function extractVariables(booking, lookupsMap = {}) {
    const buyerRaw = booking.customer?.buyer?.raw || booking.customer?.buyer || booking.lead || {};
    const sellerRaw = booking.customer?.seller?.raw || booking.customer?.seller || booking.seller || {};

    return {
        buyerFullName: getContactFullName(buyerRaw),
        buyerMobile: booking.customer?.buyer?.mobile || buyerRaw.phones?.[0]?.number || buyerRaw.mobile || '___________________________',
        buyerEmail: buyerRaw.emails?.[0]?.address || buyerRaw.email || '___________________________',
        buyerFatherName: buyerRaw.fatherName || '___________________________',
        buyerAddress: formatAddress(buyerRaw.personalAddress || buyerRaw.address, lookupsMap) || '___________________________',

        sellerFullName: getContactFullName(sellerRaw),
        sellerMobile: booking.customer?.seller?.mobile || sellerRaw.phones?.[0]?.number || sellerRaw.mobile || '___________________________',
        sellerEmail: sellerRaw.emails?.[0]?.address || sellerRaw.email || '___________________________',
        sellerFatherName: sellerRaw.fatherName || '___________________________',
        sellerAddress: formatAddress(sellerRaw.personalAddress || sellerRaw.address, lookupsMap) || '___________________________',

        propertyDetails: {
            project: booking.property?.project || booking.property?.projectName || booking.property?.projectId?.name || '___________________________',
            unit: booking.property?.unit || booking.property?.unitNo || '___________________________',
            location: booking.property?.location || '___________________________',
            block: booking.property?.block || '___________________________',
            sizeLabel: resolvePropertyField(booking.property?.sizeLabel, lookupsMap),
            category: resolvePropertyField(booking.property?.category, lookupsMap),
            subCategory: resolvePropertyField(booking.property?.subCategory, lookupsMap),
            unitType: resolvePropertyField(booking.property?.unitType, lookupsMap),
            builtupDetails: resolvePropertyField(booking.property?.builtupType, lookupsMap)
        },

        totalValue: booking.totalDealAmount || 0,
        tokenVal: booking.tokenAmount || 0,
        tokenWords: (booking.tokenAmount || 0) > 0 ? `${numberToIndianWords(booking.tokenAmount)} Only` : '_________________________',
        tokenAnko: (booking.tokenAmount || 0) > 0 ? formatCurrency(booking.tokenAmount) : '____________',
        tokenMode: booking.paymentMode || 'Cheque/RTGS/Transaction/Cash', // We don't have this in Booking.js natively but fallback
        tokenDate: booking.bookingDate || booking.createdAt ? new Date(booking.bookingDate || booking.createdAt).toLocaleDateString('en-IN') : '______________'
    };
}

// --- Templates ---
function generateShortAgreementHtml(booking, lookupsMap) {
    const vars = extractVariables(booking, lookupsMap);
    
    return `
    <html>
        <head>
            <title>Short Agreement - ${booking._id}</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; line-height: 1.4; color: #334155; }
                .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #6366f1; padding-bottom: 15px; }
                .company-name { font-size: 24px; font-weight: 900; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
                .doc-title { font-size: 18px; font-weight: 600; color: #64748b; margin-top: 10px; }
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                .box { border: 1px solid #cbd5e1; padding: 15px; border-radius: 8px; background: #f8fafc; }
                .box-title { font-size: 13px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
                .row { display: flex; justify-content: space-between; margin-bottom: 6px; border-bottom: 1px dotted #e2e8f0; padding-bottom: 3px; }
                .label { font-weight: 600; color: #475569; }
                .val { font-weight: 700; color: #0f172a; }
                .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; }
                .sig-box { border-top: 1px solid #94a3b8; padding-top: 10px; text-align: center; font-weight: 600; }
                .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-name">Bharat Properties</div>
                <div style="color: #64748b; font-size: 14px;">The Mark of Trust & Excellence in Real Estate</div>
                <div class="doc-title">BOOKING AGREEMENT (TOKEN)</div>
            </div>

            <div style="text-align: right; margin-bottom: 20px; font-weight: 600;">
                Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}<br/>
                Ref: ${booking._id}
            </div>

            <div class="grid-2">
                <div class="box">
                    <div class="box-title">Seller Details (First Party)</div>
                    <div class="row"><span class="label">Name:</span> <span class="val">${vars.sellerFullName}</span></div>
                    <div class="row"><span class="label">Father's Name:</span> <span class="val">${vars.sellerFatherName || '___________________________'}</span></div>
                    <div class="row"><span class="label">Mobile:</span> <span class="val">${vars.sellerMobile}</span></div>
                    <div class="row"><span class="label">Address:</span> <span class="val" style="font-weight: normal; font-size: 13px; line-height: 1.3;">${vars.sellerAddress || '___________________________'}</span></div>
                </div>
                <div class="box">
                    <div class="box-title">Buyer Details (Second Party)</div>
                    <div class="row"><span class="label">Name:</span> <span class="val">${vars.buyerFullName}</span></div>
                    <div class="row"><span class="label">Father's Name:</span> <span class="val">${vars.buyerFatherName || '___________________________'}</span></div>
                    <div class="row"><span class="label">Mobile:</span> <span class="val">${vars.buyerMobile}</span></div>
                    <div class="row"><span class="label">Address:</span> <span class="val" style="font-weight: normal; font-size: 13px; line-height: 1.3;">${vars.buyerAddress || '___________________________'}</span></div>
                </div>
            </div>

            <div class="box" style="margin-bottom: 20px;">
                <div class="box-title">Property Details</div>
                <div class="grid-2" style="margin-bottom: 0;">
                    <div>
                        <div class="row"><span class="label">Project/Society:</span> <span class="val">${vars.propertyDetails.project}</span></div>
                        <div class="row"><span class="label">Unit No:</span> <span class="val">${vars.propertyDetails.unit}</span></div>
                        <div class="row"><span class="label">Block/Tower:</span> <span class="val">${vars.propertyDetails.block}</span></div>
                        <div class="row"><span class="label">Unit Type:</span> <span class="val">${vars.propertyDetails.unitType}</span></div>
                    </div>
                    <div>
                        <div class="row"><span class="label">Category:</span> <span class="val">${vars.propertyDetails.category}</span></div>
                        <div class="row"><span class="label">Sub Category:</span> <span class="val">${vars.propertyDetails.subCategory}</span></div>
                        <div class="row"><span class="label">Builtup Details:</span> <span class="val">${vars.propertyDetails.builtupDetails}</span></div>
                        <div class="row"><span class="label">Size Label:</span> <span class="val">${vars.propertyDetails.sizeLabel}</span></div>
                    </div>
                </div>
            </div>

            <div class="box" style="margin-bottom: 20px; background: #f0fdf4; border-color: #86efac;">
                <div class="box-title" style="color: #166534; border-bottom-color: #bbf7d0;">Token / Advance Payment Receipt</div>
                <div style="font-size: 15px; line-height: 1.8; color: #166534; text-align: justify;">
                    Received a sum of <strong>${vars.tokenAnko}</strong>/- (<strong>${vars.tokenWords}</strong>) by <strong>${vars.tokenMode} ___________________</strong> on dated <strong>${vars.tokenDate}</strong> as an advance Payment against the sale of my above said property.
                </div>
            </div>

            <div class="box" style="margin-bottom: 20px; border-color: #cbd5e1; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div class="box-title" style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; font-size: 15px;">Financial Summary</div>
                
                <div style="background: #fdfae8; padding: 15px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #fde68a; display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; color: #92400e; font-size: 16px;">Total Consideration (Sale) Value:</span> 
                    <div style="text-align: right;">
                        <span style="font-size: 20px; font-weight: 900; color: #b45309;">${formatCurrency(vars.totalValue)}/-</span>
                        <div style="font-size: 10px; color: #d97706; font-weight: 600; margin-top: 2px;">(${numberToIndianWords(vars.totalValue)} Only)</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr; gap: 8px;">
                    <div class="row" style="background: #f8fafc; padding: 10px 15px; border-radius: 4px; border-left: 4px solid #3b82f6; border-bottom: none; align-items: center;">
                        <span class="label" style="color: #1e293b;">Agreement Amount to be Paid <span style="font-size: 13px; color: #64748b; font-weight: normal;">(Including Token Amount)</span>:</span> 
                        <div style="text-align: right;">
                            <span class="val">${formatCurrency(booking.agreementAmount || 0)}/- <span style="font-size: 13px; color: #64748b; font-weight: 500; margin-left: 8px;">${booking.agreementDate ? "(Due: " + new Date(booking.agreementDate).toLocaleDateString('en-IN') + ")" : ""}</span></span>
                        </div>
                    </div>
                    <div class="row" style="background: #fef2f2; padding: 12px 15px; border-radius: 4px; border-left: 4px solid #ef4444; border-bottom: none; align-items: center;">
                        <span class="label" style="color: #991b1b; font-size: 15px;">Rest (Balance) Payment Due:</span> 
                        <div style="text-align: right;">
                            <span class="val" style="color: #dc2626; font-size: 16px;">${formatCurrency(booking.totalBalanceAmount || 0)}/-</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="terms-text" style="font-size: 13px; color: #475569; margin-bottom: 20px; text-align: justify;">
                <strong>Terms & Conditions:</strong><br/>
                1. This is a preliminary short agreement acknowledging the token amount received against the property mentioned above.<br/>
                2. A detailed and registered Agreement to Sell will be executed upon receipt of the mutually agreed milestone payment.<br/>
                3. In case of cancellation by the buyer, the token amount shall be forfeited as per standard market practice, unless agreed otherwise in writing.<br/>
                4. If the Seller cancels the deal, the Seller shall be liable to return double the Token Amount to the Buyer at the time of cancellation.<br/>
                5. If the Buyer fails to execute the agreement by the stipulated Agreement Due Date, the Seller reserves the full right to cancel the deal.<br/>
                6. Bharat Properties acts solely as a facilitator/broker in this transaction.
            </div>

            <div style="text-align: center; margin-bottom: 20px; font-size: 14px; color: #475569;">
                This Receipt/Agreement is executed at <strong>Kurukshetra</strong> on this <strong>${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
            </div>

            <div class="signature-section" style="margin-top: 65px;">
                <div class="sig-box">Signature of First Party (Seller)</div>
                <div class="sig-box">Signature of Second Party (Buyer)</div>
            </div>

            <div class="footer" style="margin-top: 25px;">
                Generated by Bharat Properties Enterprise CRM on ${new Date().toLocaleString('en-IN')}<br/>
                This is a system generated document.
            </div>
        </body>
    </html>
    `;
}

function generateSaleAgreementHtml(booking, lookupsMap) {
    const vars = extractVariables(booking, lookupsMap);
    
    return `
    <html>
        <head>
            <title>Agreement for Sale - ${booking._id}</title>
            <style>
                body { font-family: 'Times New Roman', serif; margin: 40px; color: #000; line-height: 1.6; font-size: 15px; }
                .header { text-align: center; margin-bottom: 40px; }
                .doc-title { font-size: 24px; font-weight: 900; text-decoration: underline; margin-bottom: 5px; }
                .sub-title { font-size: 16px; font-weight: bold; }
                .section-heading { font-weight: bold; text-transform: uppercase; margin-top: 25px; margin-bottom: 10px; font-size: 16px; }
                .text-justify { text-align: justify; margin-bottom: 15px; }
                .bold { font-weight: bold; }
                .highlight { color: #b91c1c; font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="doc-title">AGREEMENT FOR SALE</div>
                <div class="sub-title">(IKRARNAMA)</div>
            </div>
            
            <div class="text-justify">
                THIS AGREEMENT FOR SALE is executed on the <span class="bold">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span> by and between the following parties:
            </div>

            <div class="section-heading">FIRST PARTY (SELLER/VENDOR):</div>
            <div class="text-justify">
                <span class="bold">Sh. ${vars.sellerFullName}</span>, son of Sh. ${vars.sellerFatherName || '_________________'}, resident of ${vars.sellerAddress}, 
                <span class="highlight">PAN: ${booking.customer?.seller?.pan || '___________'} | Aadhaar No.: ${booking.customer?.seller?.aadhaar || '___________'}</span>, 
                hereinafter referred to as the <span class="bold">"FIRST PARTY"</span> or <span class="bold">"SELLER"</span>, who is the owner and vendor of the plot described herein.
                <span class="highlight">The First Party's legal heirs, successors, and permitted assigns shall also be bound by this Agreement.</span>
            </div>

            <div class="section-heading">SECOND PARTY (PURCHASER/BUYER):</div>
            <div class="text-justify">
                <span class="bold">Sh. ${vars.buyerFullName}</span>, son of Sh. ${vars.buyerFatherName || '_________________'}, resident of ${vars.buyerAddress}, 
                <span class="highlight">PAN: ${booking.customer?.buyer?.pan || '___________'} | Aadhaar No.: ${booking.customer?.buyer?.aadhaar || '___________'}</span>, 
                hereinafter referred to as the <span class="bold">"SECOND PARTY"</span> or <span class="bold">"PURCHASER"</span>. 
                <span class="highlight">The Second Party's legal heirs, successors, and permitted assigns shall also be bound by this Agreement.</span>
            </div>

            <div class="section-heading">WHEREAS:</div>
            <div class="text-justify">
                The First Party has agreed to sell and the Second Party has agreed to purchase <span class="bold">Plot No. ${vars.propertyDetails.unit}, measuring _________</span>, 
                situated in <span class="bold">${vars.propertyDetails.project}, ${vars.propertyDetails.location}</span>, 
                for a total consideration of <span class="bold">${formatCurrency(vars.totalValue)} (${numberToIndianWords(vars.totalValue)} Only)</span>, 
                subject to the following terms and conditions:
            </div>

            <div class="section-heading">NOW, THEREFORE, IN CONSIDERATION OF THE MUTUAL COVENANTS AND AGREEMENTS, THE PARTIES AGREE AS FOLLOWS:</div>
            
            <div class="text-justify">
                <span class="bold">1. Title & Encumbrances:</span> The above-mentioned Plot No. ${vars.propertyDetails.unit}, measuring ________, situated in ${vars.propertyDetails.project}, ${vars.propertyDetails.location}, is presently free and clear of all encumbrances, charges, liens, and liabilities. 
                <span class="highlight">The First Party further confirms that the said plot is free from any benami claim, court attachment, or government acquisition proceeding, and that the First Party holds clear and marketable title with full authority to sell.</span>
            </div>

            <div class="text-justify">
                <span class="bold">2. Token/Earnest Money Received:</span> The First Party acknowledges receipt of <span class="bold">${formatCurrency(booking.totalPaidAmount || 0)} (${numberToIndianWords(booking.totalPaidAmount || 0)} Only)</span> as earnest money/token amount from the Second Party, comprising: (a) ${formatCurrency(booking.totalPaidAmount || 0)} (${numberToIndianWords(booking.totalPaidAmount || 0)} Only) via Transaction Nos. ________ dated ________; and (b) Rs. _________/- (Rupees ____________ Only) in cash on _________.
            </div>

            <div class="text-justify">
                <span class="highlight">3. Tax Deduction at Source (TDS): Since the total sale deed consideration amount may exceed Rs. 50,00,000/-, the Second Party (Purchaser) is required to deduct 1% TDS from the total sale deed consideration amount at the time of each payment, and deposit the same with the Government within the prescribed timeline using the applicable online forms. The Second Party shall provide the TDS certificate to the First Party after such deposit. Both parties shall provide their respective PAN details, which are mandatory for this purpose. If the First Party fails to provide PAN, TDS shall be deducted at a higher rate as applicable under law.</span>
            </div>

            <div class="text-justify">
                <span class="bold">4. Payment of Balance Amount & Execution of Sale Deed:</span> The First Party shall receive the balance sale consideration from the Second Party within <span class="bold">${booking.finalPaymentDate ? new Date(booking.finalPaymentDate).toLocaleDateString('en-IN', {day: '2-digit', month: '2-digit', year: 'numeric'}) : '________________'}</span>. Upon receipt of the balance amount, the First Party shall simultaneously hand over all documents relating to the said plot to the Second Party and shall get the said plot registered in the office of the Sub-Registrar/Tehsil office. <span class="highlight">The Sale Deed shall be executed on non-judicial stamp paper of appropriate value and presented for registration within four months of execution. It is agreed that this Agreement to Sell does not transfer ownership of the said plot; title shall pass only upon execution and registration of the formal Sale Deed.</span>
            </div>

            <div class="text-justify">
                <span class="bold">5. Brokerage/Commission:</span> This sale transaction has been facilitated by <span class="bold">Bharat Properties, Kurukshetra</span>. Both parties, i.e., the Buyer and Seller, shall be bound to pay commission at the rate of <span class="bold">1% (one percent)</span> of the total sale value to Bharat Properties.
            </div>

            <div class="text-justify">
                IN WITNESS WHEREOF, both parties have read, heard, and understood this Agreement and have signed the same of their own free will and volition.
            </div>

            <div class="bold" style="text-transform: uppercase; margin-top: 40px; margin-bottom: 60px;">
                IN WITNESS WHEREOF BOTH THE PARTIES HAVE SIGNED THIS AGREEMENT ON THE ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}, AT KURUKSHETRA.
            </div>

            <div style="display: flex; justify-content: space-between; margin-bottom: 80px;">
                <div style="text-align: left;">
                    <span class="bold">Signature of First Party</span><br/><br/><br/><br/>
                    (${vars.sellerFullName})
                </div>
                <div style="text-align: right;">
                    <span class="bold">Signature of Second Party</span><br/><br/><br/><br/>
                    (${vars.buyerFullName})
                </div>
            </div>
        </body>
    </html>
    `;
}

function generateDemandLetterHtml(booking, lookupsMap) {
    const vars = extractVariables(booking, lookupsMap);

    return `
    <html>
        <head>
            <title>Demand Letter - ${booking._id}</title>
            <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 50px; color: #1e293b; line-height: 1.6; }
                .header { text-align: center; border-bottom: 3px solid #334155; padding-bottom: 20px; margin-bottom: 40px; }
                .company-name { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="company-name">Bharat Properties</div>
                <div style="color: #64748b; font-size: 14px;">The Mark of Trust & Excellence in Real Estate</div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 40px; font-weight: 600;">
                <div>Date: ${new Date().toLocaleDateString('en-IN')}</div>
                <div>Ref: DL/${booking._id}</div>
            </div>
            <div style="margin-bottom: 30px;">
                <strong>To,</strong><br/>
                <strong>${vars.buyerFullName}</strong><br/>
                Ph: ${vars.buyerMobile}
            </div>
            <div style="text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 30px; text-decoration: underline;">
                PAYMENT DEMAND LETTER
            </div>
            <div style="margin-bottom: 20px;">
                Dear Sir/Madam,<br/><br/>
                Greetings from Bharat Properties.<br/><br/>
                This is with reference to your booking of <strong>Unit No. ${vars.propertyDetails.unit}</strong> in <strong>${vars.propertyDetails.project}</strong>.<br/>
                As per the agreed payment schedule, your next installment is now due for payment.
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: left;">
                <tr style="background: #f1f5f9; border: 1px solid #cbd5e1;">
                    <th style="padding: 10px; border: 1px solid #cbd5e1;">Description</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1;">Amount Due</th>
                </tr>
                <tr>
                    <td style="padding: 10px; border: 1px solid #cbd5e1;">Balance Consideration / Installment</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">${formatCurrency(booking.totalBalanceAmount || 0)}</td>
                </tr>
            </table>
            <div style="margin-bottom: 50px;">
                Kindly remit the payment at the earliest to avoid any delays in the registry/possession process.<br/>
                If the payment has already been made, please ignore this letter and share the transaction details with your relationship manager.<br/><br/>
                Thanking you,<br/><br/>
                <strong>For Bharat Properties</strong><br/><br/><br/>
                Authorized Signatory
            </div>
        </body>
    </html>
    `;
}

function generateBrokerageInvoiceHtml(booking, lookupsMap) {
    const vars = extractVariables(booking, lookupsMap);
    const commission = booking.totalCommissionAmount || (vars.totalValue * 0.01);

    return `
    <html>
        <head>
            <title>Tax Invoice - ${booking._id}</title>
            <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 50px; color: #1e293b; line-height: 1.6; }
                .header { display: flex; justify-content: space-between; border-bottom: 3px solid #334155; padding-bottom: 20px; margin-bottom: 40px; }
                .company-name { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <div class="company-name">Bharat Properties</div>
                    <div style="color: #64748b; font-size: 14px;">The Mark of Trust & Excellence in Real Estate</div>
                </div>
                <div style="text-align: right;">
                    <h2 style="margin:0; color:#334155;">TAX INVOICE</h2>
                    <div>Invoice No: INV/${booking._id}</div>
                    <div>Date: ${new Date().toLocaleDateString('en-IN')}</div>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
                <div>
                    <strong>Billed To:</strong><br/>
                    ${vars.buyerFullName} (Buyer)<br/>
                    ${vars.sellerFullName} (Seller)<br/>
                    Ref Property: ${vars.propertyDetails.unit}, ${vars.propertyDetails.project}
                </div>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <tr style="background: #f1f5f9;">
                    <th style="padding: 12px; border: 1px solid #cbd5e1; text-align: left;">Description of Services</th>
                    <th style="padding: 12px; border: 1px solid #cbd5e1; text-align: right;">Amount (INR)</th>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #cbd5e1;">Professional Real Estate Brokerage / Consultancy Fees<br/><small style="color:#64748b;">(Against sale/purchase of property unit ${vars.propertyDetails.unit})</small></td>
                    <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${formatCurrency(commission)}</td>
                </tr>
                <tr>
                    <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">Total Amount Payable</td>
                    <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; font-size: 18px;">${formatCurrency(commission)}</td>
                </tr>
            </table>
            <div style="margin-top: 60px;">
                <strong>Authorized Signatory</strong><br/><br/><br/>
                Bharat Properties
            </div>
        </body>
    </html>
    `;
}

function generateTokenReceiptHtml(booking, lookupsMap) {
    const vars = extractVariables(booking, lookupsMap);
    const amountPaid = booking.totalPaidAmount || booking.agreementAmount || booking.tokenAmount || 0;
    const amountInWords = numberToIndianWords(amountPaid);

    return `
    <html>
        <head>
            <title>Token Receipt - ${booking._id}</title>
            <style>
                body { font-family: sans-serif; padding: 40px; border: 4px double #333; margin: 20px; }
                .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 30px; }
                .receipt-no { float: right; font-weight: bold; }
                .row { display: flex; margin-bottom: 15px; align-items: baseline; }
                .label { min-width: 180px; font-weight: bold; color: #444; }
                .value { flex: 1; border-bottom: 1px dotted #666; padding-left: 10px; font-weight: 600; }
                .amount-box { margin: 30px 0; background: #f8fafc; border: 2px solid #333; padding: 15px; display: flex; justify-content: space-between; align-items: center; }
                .amount-val { font-size: 24px; font-weight: 800; }
                .words { font-style: italic; color: #6366f1; font-weight: 600; font-size: 0.9rem; }
                .footer { margin-top: 60px; display: flex; justify-content: space-between; }
                .stamp { width: 100px; height: 100px; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 0.7rem; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="receipt-no">No: ${booking._id}</div>
                <h1 style="margin: 0; color: #1e293b;">TOKEN RECEIPT</h1>
                <h2 style="margin: 5px 0; color: #6366f1;">BHARAT PROPERTIES</h2>
                <p style="margin: 0; font-size: 0.8rem; color: #64748b;">Premium Real Estate Services</p>
            </div>
            <div class="row">
                <span class="label">Date:</span>
                <span class="value">${new Date().toLocaleDateString('en-IN')}</span>
            </div>
            <div class="row">
                <span class="label">Received with thanks from:</span>
                <span class="value">${vars.buyerFullName}</span>
            </div>
             <div class="row">
                <span class="label">Sum of Rupees:</span>
                <span class="value">${amountInWords} Only</span>
            </div>
             <div class="row">
                <span class="label">Against Project/Unit:</span>
                <span class="value">${vars.propertyDetails.project} (${vars.propertyDetails.unit})</span>
            </div>
            <div class="amount-box">
                <span class="amount-val">${formatCurrency(amountPaid)}</span>
                <span class="words">Payment for Booking Token</span>
            </div>
            <div class="footer">
                <div class="stamp">E-STAMP / SEAL</div>
                <div style="text-align: center;">
                    <br/><br/>
                    -----------------------------------
                    <br/>
                    <strong>Authorised Signatory</strong>
                </div>
            </div>
        </body>
    </html>
    `;
}

// --- Main Controller ---
export const generateDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { type } = req.query; // 'Short Agreement', 'Sale Agreement', 'Demand Letter', 'Brokerage Invoice', 'Token Receipt'

        const visibilityFilter = await getVisibilityFilter(req.user);
        
        // Fetch Booking with Full Population
        const booking = await Booking.findOne({ _id: id, ...visibilityFilter })
            .populate({
                path: 'property',
                populate: [{ path: 'projectId' }, { path: 'owners' }]
            })
            .populate('lead')
            .populate('seller');

        if (!booking) return res.status(404).json({ success: false, message: "Booking record not found or access denied." });

        const bookingObj = booking.toObject();

        // Ensure Seller is correctly populated from Inventory if not assigned at Booking level
        if (!bookingObj.closingDetails?.isClosed && bookingObj.property) {
            const inventory = bookingObj.property;
            if (inventory && inventory.owners && inventory.owners.length > 0) {
                bookingObj.seller = inventory.owners[0].contact || inventory.owners[0];
            }
        }

        // Fetch All Lookups for Dictionary (Fast enough for a single request, but can be optimized if needed)
        const lookups = await Lookup.find({});
        const lookupsMap = {};
        lookups.forEach(l => {
            lookupsMap[l._id.toString()] = l.lookup_value || l.name;
        });

        // Generate HTML based on requested type
        let htmlStr = '';
        switch (type) {
            case 'Short Agreement':
                htmlStr = generateShortAgreementHtml(bookingObj, lookupsMap);
                break;
            case 'Sale Agreement':
                htmlStr = generateSaleAgreementHtml(bookingObj, lookupsMap);
                break;
            case 'Demand Letter':
                htmlStr = generateDemandLetterHtml(bookingObj, lookupsMap);
                break;
            case 'Brokerage Invoice':
                htmlStr = generateBrokerageInvoiceHtml(bookingObj, lookupsMap);
                break;
            case 'Token Receipt':
                htmlStr = generateTokenReceiptHtml(bookingObj, lookupsMap);
                break;
            default:
                return res.status(400).json({ success: false, message: "Invalid document type requested." });
        }

        // Return the HTML directly with correct content-type
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(htmlStr);
    } catch (error) {
        console.error("[DOCUMENT_CONTROLLER_ERROR]", error);
        return res.status(500).json({ success: false, message: "Error generating document.", error: error.message });
    }
};
