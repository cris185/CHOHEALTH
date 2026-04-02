document.addEventListener('DOMContentLoaded', function() {
    // Fix 1: Convert broken control-sidebar UI Builder to Bootstrap 5 offcanvas
    var controlSidebar = document.querySelector('.control-sidebar');
    if (controlSidebar) {
        // Convert the aside to a Bootstrap 5 offcanvas
        controlSidebar.classList.remove('control-sidebar', 'control-sidebar-dark');
        controlSidebar.classList.add('offcanvas', 'offcanvas-end');
        controlSidebar.setAttribute('id', 'uiBuilderOffcanvas');
        controlSidebar.setAttribute('tabindex', '-1');
        controlSidebar.setAttribute('aria-labelledby', 'uiBuilderLabel');

        // Add a close button at the top
        var content = controlSidebar.querySelector('.control-sidebar-content');
        if (content) {
            var header = document.createElement('div');
            header.className = 'offcanvas-header';
            header.innerHTML = '<h5 class="offcanvas-title" id="uiBuilderLabel">Customize UI</h5>' +
                '<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button>';
            controlSidebar.insertBefore(header, content);
            content.classList.add('offcanvas-body');
            content.classList.remove('control-sidebar-content');
            // Remove the duplicate h5 title
            var oldTitle = content.querySelector('h5');
            if (oldTitle) oldTitle.remove();
        }
    }

    // Fix the trigger button
    var uiBuilderBtn = document.querySelector('a[data-widget="control-sidebar"]');
    if (uiBuilderBtn) {
        uiBuilderBtn.removeAttribute('data-widget');
        uiBuilderBtn.removeAttribute('data-slide');
        uiBuilderBtn.setAttribute('data-bs-toggle', 'offcanvas');
        uiBuilderBtn.setAttribute('data-bs-target', '#uiBuilderOffcanvas');
        uiBuilderBtn.setAttribute('aria-controls', 'uiBuilderOffcanvas');
    }
});
