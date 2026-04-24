public class OrderHandler extends TriggerHandler {

    public override void beforeInsert() {
        OrderService.setDefaults(Trigger.new);
    }

    public override void beforeUpdate() {
        OrderService.validateStatusTransition(Trigger.new, Trigger.oldMap);
    }

    public override void afterInsert() {
        // Publish platform event so downstream systems react
        List<Order_Created__e> events = new List<Order_Created__e>();
        for (Order__c o : (List<Order__c>) Trigger.new) {
            events.add(new Order_Created__e(
                OrderId__c    = o.Id,
                AccountId__c  = o.Account__c,
                TotalAmount__c = o.TotalAmount__c
            ));
        }
        EventBus.publish(events);
    }

    public override void afterUpdate() {
        // When order is approved, create invoice
        List<Order__c> approved = new List<Order__c>();
        for (Order__c o : (List<Order__c>) Trigger.new) {
            Order__c old = (Order__c) Trigger.oldMap.get(o.Id);
            if (o.Status__c == 'Approved' && old.Status__c != 'Approved') {
                approved.add(o);
            }
        }
        if (!approved.isEmpty()) {
            InvoiceService.createForOrders(approved);
        }

        // Recalculate rollups on account
        AccountRollupService.recalculate(Trigger.new);
    }

    public override void afterDelete() {
        AccountRollupService.recalculate(Trigger.old);
    }
}
