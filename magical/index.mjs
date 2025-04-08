import SelectorSubscriber from "https://jamesaduncan.github.io/selector-subscriber/index.mjs";

import EnhancedMutationRecord from "https://jamesaduncan.github.io/dom-mutation-record/index.mjs";


/* these elements all build up into a big handy box of tricks */
import * as DAS from "https://jamesaduncan.github.io/dom-aware-primitives/index.mjs";
import * as ButtonRemove from "https://jamesaduncan.github.io/button-remove/index.mjs";
import * as LinkInclude from "https://jamesaduncan.github.io/link-include/index.mjs";
import * as FormTemplate from "https://jamesaduncan.github.io/form-template/index.mjs";

if (window.location.server.DASAware) {
    console.log('the server is DAS aware');
    SelectorSubscriber.subscribe('[patchable]', async ( theElement ) => {
        console.log("found a patchable thing", theElement);
        const observer = new MutationObserver( async( records, observer ) => {        
            console.log("mutation detected");
            const emr = EnhancedMutationRecord.fromMutationRecord( records );
            const response = await theElement.PATCH( emr );
            console.log(response);
            if ( response.ok ) {
                
            } else {
                // present the opportunity to rewind the changes with some sort of
                // error event.
            }
        });
        observer.observe( theElement, { subtree: true, childList: true });
    });

    SelectorSubscriber.subscribe(':is(form)[method=put][action]', (aThing) => {
        aThing.addEventListener('submit', (e) => {
            e.preventDefault();
            const response = document.querySelector( e.target.getAttribute('action') ).PUT();
        })
    });

    SelectorSubscriber.subscribe(':is(button)[method=put][action]', ( aThing ) => {
        aThing.addEventListener('click', async ( theEvent ) => {
            const forSelector = theEvent.target.getAttribute('action');
            const destination = document.querySelector( forSelector );
            const response = destination.PUT();
        });
    });

    SelectorSubscriber.subscribe(':not(form, button, a, input)[method=put], :is(textarea)[method=put]', ( aThing ) => {
        const eventToBind = aThing.getAttribute('when') || 'blur';
        aThing.addEventListener(eventToBind, ( theEvent ) => {
            if ( aThing instanceof HTMLTextAreaElement) aThing.innerText = aThing.value;
            const response = theEvent.target.PUT();
        })
    });

    SelectorSubscriber.subscribe(':is(input)[method=put]', (anInput) => {
        anInput.addEventListener('change', ( theEvent ) => {
            anInput.setAttribute('value', anInput.value);
            const response = theEvent.target.PUT();
        });
    });
} else {
    console.log('not dom aware')
}