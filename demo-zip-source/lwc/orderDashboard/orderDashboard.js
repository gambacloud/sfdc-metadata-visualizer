import { LightningElement, wire, track } from 'lwc';
import getOrders        from '@salesforce/apex/OrderApiController.getOrder';
import updateOrderStatus from '@salesforce/apex/OrderApiController.updateOrderStatus';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';

export default class OrderDashboard extends NavigationMixin(LightningElement) {
    @track orders = [];
    @track showFlow = false;

    columns = [
        { label: 'Order',  fieldName: 'Name' },
        { label: 'Status', fieldName: 'Status__c' },
        { label: 'Total',  fieldName: 'TotalAmount__c', type: 'currency' },
        {
            type: 'action',
            typeAttributes: {
                rowActions: [
                    { label: 'Approve', name: 'approve' },
                    { label: 'Cancel',  name: 'cancel'  }
                ]
            }
        }
    ];

    @wire(getOrders)
    wiredOrders({ data, error }) {
        if (data)  this.orders = data;
        if (error) console.error(error);
    }

    handleNewOrder() {
        this.showFlow = true;
    }

    handleFlowStatusChange(event) {
        if (event.detail.status === 'FINISHED') {
            this.showFlow = false;
            // Navigate to new order record
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: event.detail.outputVariables[0].value,
                    actionName: 'view'
                }
            });
        }
    }

    handleRowAction(event) {
        const action = event.detail.action.name;
        const row    = event.detail.row;
        const status = action === 'approve' ? 'Approved' : 'Cancelled';
        updateOrderStatus({ orderId: row.Id, status })
            .then(() => this.dispatchEvent(new ShowToastEvent({ title: 'Success', variant: 'success' })))
            .catch(err => console.error(err));
    }
}
