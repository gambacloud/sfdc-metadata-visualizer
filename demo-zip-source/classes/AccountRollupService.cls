public class AccountRollupService {

    @future
    public static void recalculate(List<Order__c> orders) {
        Set<Id> accountIds = new Set<Id>();
        for (Order__c o : orders) {
            if (o.Account__c != null) accountIds.add(o.Account__c);
        }
        // Aggregate query and update accounts
        Map<Id, AggregateResult> totals = new Map<Id, AggregateResult>();
        for (AggregateResult ar : [
            SELECT Account__c accId, SUM(TotalAmount__c) total
            FROM Order__c
            WHERE Account__c IN :accountIds
            GROUP BY Account__c
        ]) {
            totals.put((Id) ar.get('accId'), ar);
        }
        List<Account> toUpdate = new List<Account>();
        for (Id accId : accountIds) {
            Decimal total = totals.containsKey(accId)
                ? (Decimal) totals.get(accId).get('total') : 0;
            toUpdate.add(new Account(Id = accId, AnnualRevenue = total));
        }
        if (!toUpdate.isEmpty()) update toUpdate;
    }
}
