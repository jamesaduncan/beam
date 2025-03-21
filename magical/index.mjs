import SelectorSubscriber from "https://jamesaduncan.github.io/selector-subscriber/index.mjs";
import EnhancedMutationRecord from "https://jamesaduncan.github.io/dom-mutation-record/index.mjs";

if (!document) document = {};


SelectorSubscriber.subscribe('[patchable]', async ( theElement ) => {
    const observer = new MutationObserver( async( records, observer ) => {        
        const emr = EnhancedMutationRecord.fromMutationRecord( records );

        const url = theElement.getAttribute('action') || window.location;
        const headers = new Headers();
        headers.set('content-type', 'application/json');
        const response = await fetch(url, {
            method: 'PATCH',
            headers: headers,
            body: JSON.stringify( emr )
        });
        if ( response.ok ) {
            
        } else {
            // present the opportunity to rewind the changes with some sort of
            // error event.
        }
    });
    observer.observe( theElement, { subtree: true, childList: true });
})

SelectorSubscriber.subscribe(':is(button)[method=delete][closest]', ( aButton ) => {
    aButton.addEventListener('click', async ( theEvent ) => {
        const closestSelector = aButton.getAttribute('closest');
        const matchedElement  = aButton.closest( closestSelector );

        const headers = new Headers();
        headers.set('Range', `selector=${ generateSelector(matchedElement) }`)
        const response = await fetch(window.location, {
            headers,
            method: 'DELETE'
        })
        if (response.ok) {
            matchedElement.parentNode.removeChild( matchedElement );
        }        
    });
})

SelectorSubscriber.subscribe(':is(form, button)[method=put][action]', ( aThing ) => {
    let eventName = "submit"
    if ( aThing instanceof HTMLButtonElement ) eventName = "click"

    aThing.addEventListener(eventName, async ( theEvent ) => {
        theEvent.preventDefault();

        const forSelector = theEvent.target.getAttribute('action');
        const destination = document.querySelector(forSelector);
        const originalCopy = destination.cloneNode( true ); // so we can rollback if we need to.

        if ( destination.put ) {
            destination.put.apply(destination, [] )
        } else {
            const formdata = new FormData( aThing );
            const template = destination.querySelector('template');
            if ( template ) {
                const clone = template.content.cloneNode( true );
                formdata.keys().forEach( (key) => {
                    try {
                        clone.querySelector(`slot[name=${key}]`).replaceWith( document.createTextNode( formdata.get( key ) ) );
                    } catch(e) {
                        console.warn(e);
                    }
                });
                destination.appendChild( clone );
            } else {
                console.error(`no way to handle form`);
            }            
        }


        const headers = new Headers();
        headers.set("Range", `selector=${forSelector}`);
        headers.set("Content-Type", "text/html");

        const response = await fetch(window.location, {
            headers,
            body  : destination.outerHTML,
            method: 'PUT'
        })
        if (response.ok) {
            if (aThing instanceof HTMLFormElement) aThing.reset();
            const evt = new Event('MSuccess', {
                bubbles: true,
                detail: { response: response, method: 'PUT', headers }
            })
            aThing.dispatchEvent( evt )            
        } else {
            actOnElement.innerHTML = originalCopy.innerHTML;
            const evt = new Event('MError', {
                bubbles: true,
                detail: { response: response, method: 'PUT', headers }
            })
            aThing.dispatchEvent( evt )            
        }
    });
})
