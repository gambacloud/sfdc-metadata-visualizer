trigger InvoiceTrigger on Invoice__c (before insert, after insert, after update) {
    new InvoiceHandler().run();
}
