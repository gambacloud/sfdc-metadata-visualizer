trigger OrderCreatedEventTrigger on Order_Created__e (after insert) {
    Database.executeBatch(new OrderSyncBatch(), 200);
}
