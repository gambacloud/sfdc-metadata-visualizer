({
    openApprovalFlow: function(component) {
        component.set('v.showModal', true);
    },

    handleFlowStatusChange: function(component, event) {
        if (event.getParam('status') === 'FINISHED') {
            component.set('v.showModal', false);
        }
    }
})
