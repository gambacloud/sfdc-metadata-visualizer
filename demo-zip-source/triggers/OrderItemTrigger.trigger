trigger OrderItemTrigger on OrderItem__c (after insert, after update, after delete) {
    new OrderItemHandler().run();
}
