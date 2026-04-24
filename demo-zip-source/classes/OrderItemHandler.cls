public class OrderItemHandler extends TriggerHandler {

    public override void afterInsert() {
        OrderService.recalculateTotal(getOrderIds());
    }

    public override void afterUpdate() {
        OrderService.recalculateTotal(getOrderIds());
    }

    public override void afterDelete() {
        OrderService.recalculateTotal(getOrderIdsFromOld());
    }

    private Set<Id> getOrderIds() {
        Set<Id> ids = new Set<Id>();
        for (OrderItem__c item : (List<OrderItem__c>) Trigger.new) {
            ids.add(item.Order__c);
        }
        return ids;
    }

    private Set<Id> getOrderIdsFromOld() {
        Set<Id> ids = new Set<Id>();
        for (OrderItem__c item : (List<OrderItem__c>) Trigger.old) {
            ids.add(item.Order__c);
        }
        return ids;
    }
}
