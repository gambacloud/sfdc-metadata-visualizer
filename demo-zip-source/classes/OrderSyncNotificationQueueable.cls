public class OrderSyncNotificationQueueable implements Queueable, Database.AllowsCallouts {

    public void execute(QueueableContext ctx) {
        Http http = new Http();
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:Slack_Integration/notify');
        req.setMethod('POST');
        req.setBody('{"message":"Order ERP sync batch completed successfully"}');
        http.send(req);
    }
}
