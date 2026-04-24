import { LightningElement, api, wire } from 'lwc';
import getInvoice    from '@salesforce/apex/InvoiceService.getInvoice';
import markInvoicePaid from '@salesforce/apex/InvoiceService.markPaid';

export default class InvoiceViewer extends LightningElement {
    @api recordId;
    invoice;

    @wire(getInvoice, { invoiceId: '$recordId' })
    wiredInvoice({ data, error }) {
        if (data)  this.invoice = data;
        if (error) console.error(error);
    }

    handleMarkPaid() {
        markInvoicePaid({ invoiceId: this.recordId })
            .then(() => { this.invoice = { ...this.invoice, Status__c: 'Paid' }; })
            .catch(err => console.error(err));
    }
}
