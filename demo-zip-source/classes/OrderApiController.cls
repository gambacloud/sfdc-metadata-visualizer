@RestResource(urlMapping='/orders/*')
global class OrderApiController {

    @HttpGet
    global static Order__c getOrder() {
        RestRequest req = RestContext.request;
        String orderId = req.requestURI.substring(req.requestURI.lastIndexOf('/') + 1);
        return [SELECT Id, Status__c, TotalAmount__c, Account__c FROM Order__c WHERE Id = :orderId LIMIT 1];
    }

    @HttpPost
    global static String createOrder() {
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(RestContext.request.requestBody.toString());
        Order__c o = new Order__c(
            Account__c    = (String) body.get('accountId'),
            TotalAmount__c = (Decimal) body.get('totalAmount')
        );
        insert o;   // <-- DML: will fire OrderTrigger
        return o.Id;
    }

    @HttpPatch
    global static void updateOrderStatus() {
        Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(RestContext.request.requestBody.toString());
        String orderId = (String) body.get('orderId');
        String newStatus = (String) body.get('status');
        update new Order__c(Id = orderId, Status__c = newStatus);
    }
}
