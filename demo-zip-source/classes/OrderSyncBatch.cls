public class OrderSyncBatch implements Database.Batchable<SObject>, Database.AllowsCallouts {

    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([
            SELECT Id, Status__c, TotalAmount__c, Account__c, SyncedToERP__c
            FROM Order__c
            WHERE SyncedToERP__c = false
            AND Status__c = 'Approved'
        ]);
    }

    public void execute(Database.BatchableContext bc, List<Order__c> scope) {
        // Push to external ERP via REST
        Http http = new Http();
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:ERP_Integration/orders/sync');
        req.setMethod('POST');
        req.setBody(JSON.serialize(scope));
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            List<Order__c> toUpdate = new List<Order__c>();
            for (Order__c o : scope) {
                toUpdate.add(new Order__c(Id = o.Id, SyncedToERP__c = true));
            }
            update toUpdate;  // <-- DML: will re-fire OrderTrigger
        }
    }

    public void finish(Database.BatchableContext bc) {
        // Send completion notification
        System.enqueueJob(new OrderSyncNotificationQueueable());
    }
}
