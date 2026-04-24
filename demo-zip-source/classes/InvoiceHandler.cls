public class InvoiceHandler extends TriggerHandler {

    public override void beforeInsert() {
        InvoiceService.setDueDate(Trigger.new);
    }

    public override void afterInsert() {
        InvoiceService.sendNotification(Trigger.new);
    }

    public override void afterUpdate() {
        List<Invoice__c> paid = new List<Invoice__c>();
        for (Invoice__c inv : (List<Invoice__c>) Trigger.new) {
            Invoice__c old = (Invoice__c) Trigger.oldMap.get(inv.Id);
            if (inv.Status__c == 'Paid' && old.Status__c != 'Paid') {
                paid.add(inv);
            }
        }
        if (!paid.isEmpty()) {
            // Mark parent orders as fulfilled
            List<Order__c> toUpdate = new List<Order__c>();
            for (Invoice__c inv : paid) {
                toUpdate.add(new Order__c(
                    Id = inv.Order__c,
                    Status__c = 'Fulfilled'
                ));
            }
            update toUpdate;  // <-- DML: will re-fire OrderTrigger
        }
    }
}
