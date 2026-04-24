public class OrderService {

    public static void setDefaults(List<Order__c> orders) {
        for (Order__c o : orders) {
            if (o.Status__c == null) o.Status__c = 'Draft';
        }
    }

    public static void validateStatusTransition(List<Order__c> newOrders, Map<Id, SObject> oldMap) {
        for (Order__c o : newOrders) {
            Order__c old = (Order__c) oldMap.get(o.Id);
            if (o.Status__c == 'Draft' && old.Status__c == 'Approved') {
                o.Status__c.addError('Cannot revert an approved order to Draft.');
            }
        }
    }

    public static void recalculateTotal(Set<Id> orderIds) {
        List<Order__c> orders = [
            SELECT Id, (SELECT UnitPrice__c, Quantity__c FROM OrderItems__r)
            FROM Order__c
            WHERE Id IN :orderIds
        ];
        List<Order__c> toUpdate = new List<Order__c>();
        for (Order__c o : orders) {
            Decimal total = 0;
            for (OrderItem__c item : o.OrderItems__r) {
                total += (item.UnitPrice__c ?? 0) * (item.Quantity__c ?? 0);
            }
            toUpdate.add(new Order__c(Id = o.Id, TotalAmount__c = total));
        }
        if (!toUpdate.isEmpty()) update toUpdate;
    }
}
