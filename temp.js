    const handleGenerateDoc = (docType) => {
        if (selectedIds.length !== 1) {
            alert("Please select exactly one booking to generate documents.");
            return;
        }
        const booking = filteredData.find(b => b.id === selectedIds[0]);
        if (!booking) return;

        const printWindow = window.open('', '_blank', 'width=900,height=800');
        if (printWindow) {
            const buyerName = booking.customer?.buyer?.name || '___________________________';
            const buyerPhone = booking.customer?.buyer?.mobile || '___________________________';
            const sellerName = booking.customer?.seller?.name || '___________________________';
            const sellerPhone = booking.customer?.seller?.mobile || '___________________________';
            
            const propertyDetails = {
                project: booking.property?.project || '___________________________',
                unit: booking.property?.unit || '___________________________',
                location: booking.property?.location || '___________________________',
                block: booking.property?.block || '___________________________'
            };

            const totalValue = booking.financials?.dealValue || 0;

            if (docType === 'Short Agreement') {
                printWindow.document.write(`
                <html>
                    <head>
                        <title>Short Agreement - ${booking.id}</title>
                        <style>
                            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; line-height: 1.5; color: #334155; }
                            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #6366f1; padding-bottom: 20px; }
                            .title { font-size: 22px; font-weight: bold; color: #1e293b; text-transform: uppercase; letter-spacing: 1px; }
                            .party-info { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; background: #f8fafc; padding: 20px; borderRadius: 12px; }
                            .party-box h4 { margin: 0 0 10px 0; color: #6366f1; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 1px; }
                            .party-name { font-size: 1.1rem; font-weight: 700; color: #0f172a; }
                            body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 40px; color: #1e293b; line-height: 1.6; }
                            .header { text-align: center; border-bottom: 3px solid #334155; padding-bottom: 20px; margin-bottom: 30px; }
                            .company-name { font-size: 28px; font-weight: 900; color: #0f172a; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 2px; }
                            .doc-title { font-size: 20px; font-weight: 600; color: #64748b; margin-top: 15px; }
                            .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px; }
                            .box { border: 1px solid #cbd5e1; padding: 20px; border-radius: 8px; background: #f8fafc; }
                            .box-title { font-size: 14px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
                            .row { display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px dotted #e2e8f0; padding-bottom: 4px; }
                            .label { font-weight: 600; color: #475569; }
                            .val { font-weight: 700; color: #0f172a; }
                            .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; }
                            .sig-box { border-top: 1px solid #94a3b8; padding-top: 10px; text-align: center; font-weight: 600; }
                            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="company-name">Bharat Properties</div>
                            <div style="color: #64748b; font-size: 14px;">The Mark of Trust & Excellence in Real Estate</div>
                            <div class="doc-title">BOOKING AGREEMENT (SHORT FORM)</div>
                        </div>

                        <div style="text-align: right; margin-bottom: 20px; font-weight: 600;">
                            Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}<br/>
                            Ref: ${booking.id}
                        </div>

                        <div class="grid-2">
                            <div class="box">
                                <div class="box-title">Buyer Details (First Party)</div>
                                <div class="row"><span class="label">Name:</span> <span class="val">${buyerName}</span></div>
                                <div class="row"><span class="label">Contact:</span> <span class="val">${buyerPhone}</span></div>
                            </div>
                            <div class="box">
                                <div class="box-title">Seller Details (Second Party)</div>
                                <div class="row"><span class="label">Name:</span> <span class="val">${sellerName}</span></div>
                                <div class="row"><span class="label">Contact:</span> <span class="val">${sellerPhone}</span></div>
                            </div>
                        </div>

                        <div class="box" style="margin-bottom: 30px;">
                            <div class="box-title">Property Schedule</div>
                            <div class="grid-2" style="margin-bottom: 0;">
                                <div>
                                    <div class="row"><span class="label">Project/Society:</span> <span class="val">${propertyDetails.project}</span></div>
                                    <div class="row"><span class="label">Unit No:</span> <span class="val">${propertyDetails.unit}</span></div>
                                </div>
                                <div>
                                    <div class="row"><span class="label">Location:</span> <span class="val">${propertyDetails.location}</span></div>
                                    <div class="row"><span class="label">Block/Tower:</span> <span class="val">${propertyDetails.block}</span></div>
                                </div>
                            </div>
                        </div>

                        <div class="box" style="margin-bottom: 30px; background: #fffbeb; border-color: #fcd34d;">
                            <div class="box-title" style="color: #b45309; border-bottom-color: #fde68a;">Financial Summary</div>
                            <div class="row"><span class="label">Total Consideration Value:</span> <span class="val" style="font-size: 16px; color: #b45309;">${formatCurrency(totalValue)}</span></div>
                            <div class="row"><span class="label">Booking/Token Amount Paid:</span> <span class="val">${formatCurrency(booking.financials.totalPaidAmount || 0)}</span></div>
                            <div class="row"><span class="label">Balance Amount Due:</span> <span class="val">${formatCurrency(booking.financials.totalBalanceAmount || 0)}</span></div>
                            ${booking.financials.finalPaymentDate ? `<div class="row"><span class="label">Final Payment Due Date:</span> <span class="val">${new Date(booking.financials.finalPaymentDate).toLocaleDateString('en-IN')}</span></div>` : ''}
                        </div>

                        </div>

                        <div style="font-size: 13px; color: #475569; margin-bottom: 40px; text-align: justify;">
                            <strong>Terms & Conditions:</strong><br/>
                            1. This is a preliminary short agreement acknowledging the token amount received against the property mentioned above.<br/>
                            2. A detailed and registered Agreement to Sell will be executed upon receipt of the mutually agreed milestone payment.<br/>
                            3. In case of cancellation by the buyer, the token amount shall be forfeited as per standard market practice, unless agreed otherwise in writing.<br/>
                            4. Bharat Properties acts solely as a facilitator/broker in this transaction.
                        </div>

                        <div class="signature-section">
                            <div class="sig-box">Signature of First Party (Buyer)</div>
                            <div class="sig-box">Signature of Second Party (Seller)</div>
                        </div>

                        <div class="footer">
                            Generated by Bharat Properties Enterprise CRM on ${new Date().toLocaleString('en-IN')}<br/>
                            This is a system generated document.
                        </div>
                    </body>
                </html>
            `);
        } else if (docType === 'Sale Agreement') {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Agreement for Sale - ${booking.id}</title>
                        <style>
                            body { font-family: 'Times New Roman', serif; margin: 60px; color: #000; line-height: 1.6; font-size: 15px; }
                            .header { text-align: center; margin-bottom: 40px; }
                            .doc-title { font-size: 24px; font-weight: 900; text-decoration: underline; margin-bottom: 5px; }
                            .sub-title { font-size: 16px; font-weight: bold; }
                            .section-heading { font-weight: bold; text-transform: uppercase; margin-top: 25px; margin-bottom: 10px; font-size: 16px; }
                            .text-justify { text-align: justify; margin-bottom: 15px; }
                            .bold { font-weight: bold; }
                            .highlight { color: #b91c1c; font-weight: bold; } /* Based on the red highlights in user doc */
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="doc-title">AGREEMENT FOR SALE</div>
                            <div class="sub-title">(SALE AGREEMENT / IKRARNAMA)</div>
                        </div>
                        
                        <div class="text-justify">
                            THIS AGREEMENT FOR SALE is executed on the <span class="bold">${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span> by and between the following parties:
                        </div>

                        <div class="section-heading">FIRST PARTY (SELLER/VENDOR):</div>
                        <div class="text-justify">
                            <span class="bold">${sellerName}</span>, resident of ${booking.customer?.seller?.address || '___________________________'}, 
                            <span class="highlight">PAN: ${booking.customer?.seller?.pan || '___________'} | Aadhaar No.: ${booking.customer?.seller?.aadhaar || '___________'}</span>, 
                            hereinafter referred to as the <span class="bold">"FIRST PARTY"</span> or <span class="bold">"SELLER"</span>, who is the owner and vendor of the property described herein.
                            <span class="highlight">The First Party's legal heirs, successors, and permitted assigns shall also be bound by this Agreement.</span>
                        </div>

                        <div class="section-heading">SECOND PARTY (PURCHASER/BUYER):</div>
                        <div class="text-justify">
                            <span class="bold">${buyerName}</span>, resident of ${booking.customer?.buyer?.address || '___________________________'}, 
                            <span class="highlight">PAN: ${booking.customer?.buyer?.pan || '___________'} | Aadhaar No.: ${booking.customer?.buyer?.aadhaar || '___________'}</span>, 
                            hereinafter referred to as the <span class="bold">"SECOND PARTY"</span> or <span class="bold">"PURCHASER"</span>. 
                            <span class="highlight">The Second Party's legal heirs, successors, and permitted assigns shall also be bound by this Agreement.</span>
                        </div>

                        <div class="section-heading">WHEREAS:</div>
                        <div class="text-justify">
                            The First Party has agreed to sell and the Second Party has agreed to purchase <span class="bold">Unit/Plot No. ${propertyDetails.unit}</span>, 
                            situated in <span class="bold">${propertyDetails.project}, ${propertyDetails.location}</span>, 
                            for a total consideration of <span class="bold">${formatCurrency(totalValue)} (${numberToIndianWords(totalValue)} Only)</span>, 
                            subject to the following terms and conditions:
                        </div>

                        <div class="section-heading">NOW, THEREFORE, IN CONSIDERATION OF THE MUTUAL COVENANTS AND AGREEMENTS, THE PARTIES AGREE AS FOLLOWS:</div>
                        
                        <div class="text-justify">
                            <span class="bold">1. Title & Encumbrances:</span> The above-mentioned property is presently free and clear of all encumbrances, charges, liens, and liabilities of any kind. 
                            <span class="highlight">The First Party further confirms that the said property is free from any benami claim, court attachment, or government acquisition proceeding, and that the First Party holds clear and marketable title with full authority to sell.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">2. Token/Earnest Money Received:</span> The First Party acknowledges receipt of <span class="bold">${formatCurrency(booking.financials.totalPaidAmount || 0)} (${numberToIndianWords(booking.financials.totalPaidAmount || 0)} Only)</span> as earnest money/token amount from the Second Party.
                            <span class="highlight">Both parties confirm that all payments have been made through legitimate and disclosed sources of funds, and both parties shall duly declare this amount in their respective Income Tax Returns for the relevant financial year.</span>
                        </div>

                        <div class="text-justify">
                            <span class="bold">3. Balance Payment:</span> The balance amount of <span class="bold">${formatCurrency(booking.financials.totalBalanceAmount || 0)}</span> shall be paid by the Second Party to the First Party on or before <span class="bold">${booking.financials.finalPaymentDate ? new Date(booking.financials.finalPaymentDate).toLocaleDateString('en-IN') : '________________'}</span> at the time of execution and registration of the Sale Deed.
                        </div>

                        <div class="text-justify">
                            <span class="highlight">4. Tax Deduction at Source (TDS): Since the total sale deed consideration amount may exceed Rs. 50,00,000/-, the Second Party (Purchaser) is required to deduct 1% TDS from the total sale deed consideration amount at the time of each payment, and deposit the same with the Government within the prescribed timeline using the applicable forms.</span>
                        </div>

                        <div class="text-justify">
                            IN WITNESS WHEREOF, the parties hereto have signed this Agreement for Sale on the date and place first written above in the presence of the following witnesses.
                        </div>

                        <div style="margin-top: 80px; display: flex; justify-content: space-between;">
                            <div style="text-align: center; border-top: 1px solid #000; padding-top: 5px; width: 250px;">
                                <span class="bold">FIRST PARTY (SELLER)</span><br/>${sellerName}
                            </div>
                            <div style="text-align: center; border-top: 1px solid #000; padding-top: 5px; width: 250px;">
                                <span class="bold">SECOND PARTY (BUYER)</span><br/>${buyerName}
                            </div>
                        </div>

                        <div style="margin-top: 50px;">
                            <div class="bold">WITNESSES:</div>
                            <ol>
                                <li style="margin-bottom: 40px; margin-top: 20px;">Signature: ______________________<br/>Name: ______________________</li>
                                <li>Signature: ______________________<br/>Name: ______________________</li>
                            </ol>
                        </div>
                    </body>
                </html>
            `);
        } else if (docType === 'Demand Letter') {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Demand Letter - ${booking.id}</title>
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
                            <div>Ref: DL/${booking.id}</div>
                        </div>
                        <div style="margin-bottom: 30px;">
                            <strong>To,</strong><br/>
                            <strong>${buyerName}</strong><br/>
                            Ph: ${buyerPhone}
                        </div>
                        <div style="text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 30px; text-decoration: underline;">
                            PAYMENT DEMAND LETTER
                        </div>
                        <div style="margin-bottom: 20px;">
                            Dear Sir/Madam,<br/><br/>
                            Greetings from Bharat Properties.<br/><br/>
                            This is with reference to your booking of <strong>Unit No. ${propertyDetails.unit}</strong> in <strong>${propertyDetails.project}</strong>.<br/>
                            As per the agreed payment schedule, your next installment is now due for payment.
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; text-align: left;">
                            <tr style="background: #f1f5f9; border: 1px solid #cbd5e1;">
                                <th style="padding: 10px; border: 1px solid #cbd5e1;">Description</th>
                                <th style="padding: 10px; border: 1px solid #cbd5e1;">Amount Due</th>
                            </tr>
                            <tr>
                                <td style="padding: 10px; border: 1px solid #cbd5e1;">Balance Consideration / Installment</td>
                                <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">${formatCurrency(booking.financials.totalBalanceAmount || 0)}</td>
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
            `);
        } else if (docType === 'Brokerage Invoice') {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Tax Invoice - ${booking.id}</title>
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
                                <div>Invoice No: INV/${booking.id}</div>
                                <div>Date: ${new Date().toLocaleDateString('en-IN')}</div>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 40px;">
                            <div>
                                <strong>Billed To:</strong><br/>
                                ${buyerName} (Buyer)<br/>
                                ${sellerName} (Seller)<br/>
                                Ref Property: ${propertyDetails.unit}, ${propertyDetails.project}
                            </div>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                            <tr style="background: #f1f5f9;">
                                <th style="padding: 12px; border: 1px solid #cbd5e1; text-align: left;">Description of Services</th>
                                <th style="padding: 12px; border: 1px solid #cbd5e1; text-align: right;">Amount (INR)</th>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #cbd5e1;">Professional Real Estate Brokerage / Consultancy Fees<br/><small style="color:#64748b;">(Against sale/purchase of property unit ${propertyDetails.unit})</small></td>
                                <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${formatCurrency(booking.financials.commissionTotal || 0)}</td>
                            </tr>
                            <tr>
                                <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">Total Amount Payable</td>
                                <td style="padding: 12px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold; font-size: 18px;">${formatCurrency(booking.financials.commissionTotal || 0)}</td>
                            </tr>
                        </table>
                        <div style="margin-top: 60px;">
                            <strong>Authorized Signatory</strong><br/><br/><br/>
                            Bharat Properties
                        </div>
                    </body>
                </html>
            `);
        } else if (docType === 'Token Receipt') {
            const amountInWords = numberToIndianWords(booking.financials.agreementAmount);
            printWindow.document.write(`
                <html>
                    <head>
                        <title>Token Receipt - ${booking.id}</title>
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
                            .stamp { width: 100px; height: 100px; border: 1px dashed #ccc; display: flex; alignItems: center; justifyContent: center; color: #ccc; font-size: 0.7rem; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <div class="receipt-no">No: ${booking.id}</div>
                            <h1 style="margin: 0; color: #1e293b;">TOKEN RECEIPT</h1>
                            <h2 style="margin: 5px 0; color: #6366f1;">BHARAT PROPERTIES</h2>
                            <p style="margin: 0; font-size: 0.8rem; color: #64748b;">Premium Real Estate Services</p>
                        </div>
                        <div class="row">
                            <span class="label">Date:</span>
                            <span class="value">${booking.dealDate ? new Date(booking.dealDate).toLocaleDateString() : new Date().toLocaleDateString()}</span>
                        </div>
                        <div class="row">
                            <span class="label">Received with thanks from:</span>
                            <span class="value">${booking.customer.buyer.name}</span>
                        </div>
                         <div class="row">
                            <span class="label">Sum of Rupees:</span>
                            <span class="value">${amountInWords} Only</span>
                        </div>
                         <div class="row">
                            <span class="label">Against Project/Unit:</span>
                            <span class="value">${booking.property.project} (${booking.property.unit})</span>
                        </div>
                        <div class="amount-box">
                            <span class="amount-val">${formatCurrency(booking.financials.agreementAmount)}</span>
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
                        <script>window.onload = function() { window.print(); window.close(); }</script>
                    </body>
                </html>
            `);
        }
        printWindow.document.close();
        setShowDocOptions(false);
};
}
}
}
