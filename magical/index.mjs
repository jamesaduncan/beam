import SelectorSubscriber from "https://jamesaduncan.github.io/selector-subscriber/index.mjs";
import * as DAS from "https://jamesaduncan.github.io/dom-aware-primitives/index.mjs"; // this forces the load before we get there.

const { DOMAware } = await window.location.server;

if (DOMAware) {
    SelectorSubscriber.subscribe('[patchable]', async ( theElement ) => {
        const observer = new MutationObserver( async( records, observer ) => {        
            const emr = EnhancedMutationRecord.fromMutationRecord( records );
            const response = await theElement.PATCH( emr );
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
            const destination = document.querySelector(forSelector);
            const response = destination.PUT();
        });
    });

    SelectorSubscriber.subscribe(':not(form, button, a, input)[method=put]', ( aThing ) => {
        const eventToBind = aThing.getAttribute('when') || 'blur';
        aThing.addEventListener(eventToBind, ( theEvent ) => {
            const response = theEvent.target.PUT();   
        })
    });

    SelectorSubscriber.subscribe(':is(input)[method=put]', (anInput) => {
        anInput.addEventListener('change', () => {
            anInput.setAttribute('value', anInput.value);
            const response = anInput.PUT();
        });
    });
} else {
    console.log('not dom aware')
}