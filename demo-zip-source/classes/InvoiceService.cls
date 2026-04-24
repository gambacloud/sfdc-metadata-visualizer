public class InvoiceService {

    public static void setDueDate(List<Invoice__c> invoices) {
        for (Invoice__c inv : invoices) {
            inv.DueDate__c = Date.today().addDays(30);
        }
    }

    public static void createForOrders(List<Order__c> orders) {
        List<Invoice__c> toInsert = new List<Invoice__c>();
        for (Order__c o : orders) {
            toInsert.add(new Invoice__c(
                Order__c  = o.Id,
                Status__c = 'Draft'
            ));
        }
        if (!toInsert.isEmpty()) insert toInsert;  // <-- DML: will fire InvoiceTrigger
    }

    public static void sendNotification(List<Invoice__c> invoices) {
        // Calls external REST service
        Http http = new Http();
        for (Invoice__c inv : invoices) {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('callout:Invoice_Notification_Service/notify');
            req.setMethod('POST');
            req.setBody('{"invoiceId":"' + inv.Id + '"}');
            http.send(req);
        }
    }
}
