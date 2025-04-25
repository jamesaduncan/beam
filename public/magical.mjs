import SelectorSubscriber from "https://jamesaduncan.github.io/selector-subscriber/index.mjs";

import EnhancedMutationRecord from "https://jamesaduncan.github.io/dom-mutation-record/index.mjs";


/* these elements all build up into a big handy box of tricks */
import * as BloomFilter from "https://jamesaduncan.github.io/bloom-filter-js/src/main.js";
import * as DAS from "https://jamesaduncan.github.io/dom-aware-primitives/index.mjs";
import * as ButtonRemove from "https://jamesaduncan.github.io/button-remove/index.mjs";
import * as LinkInclude from "https://jamesaduncan.github.io/link-include/index.mjs";
import * as FormTemplate from "https://jamesaduncan.github.io/form-template/index.mjs";
import { deflate, inflate } from 'https://cdn.skypack.dev/pako';

class CuckooFilter {
    constructor(size = 1024, bucketSize = 4, fingerprintSize = 1, maxKicks = 500) {
        this.size = size;
        this.bucketSize = bucketSize;
        this.fingerprintSize = fingerprintSize;
        this.maxKicks = maxKicks;
        this.buckets = Array.from({ length: size }, () => new Array(bucketSize).fill(null));
        this.count = 0;
    }

    hash(value) {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
        }
        return hash;
    }

    fingerprint(value) {
        const hashVal = this.hash(value);
        return (hashVal % 256).toString(16).padStart(2, '0').slice(0, this.fingerprintSize);
    }

    index1(fingerprint) {
        return this.hash(fingerprint) % this.size;
    }

    index2(fingerprint, index1) {
        const fpHash = this.hash(fingerprint);
        return (index1 ^ (fpHash % this.size)) % this.size;
    }

    insert(value) {
        let fp = this.fingerprint(value);
        let i1 = this.index1(fp);
        let i2 = this.index2(fp, i1);

        for (const i of [i1, i2]) {
        for (let j = 0; j < this.bucketSize; j++) {
            if (this.buckets[i][j] === null) {
            this.buckets[i][j] = fp;
            this.count++;
            return true;
            }
        }
        }

        let i = Math.random() < 0.5 ? i1 : i2;
        for (let n = 0; n < this.maxKicks; n++) {
        const j = Math.floor(Math.random() * this.bucketSize);
        const evicted = this.buckets[i][j];
        this.buckets[i][j] = fp;
        fp = evicted;
        i = this.index2(fp, i);

        for (let k = 0; k < this.bucketSize; k++) {
            if (this.buckets[i][k] === null) {
            this.buckets[i][k] = fp;
            this.count++;
            return true;
            }
        }
        }

        this.resize();
        return this.insert(value);
    }

    resize() {
        const oldBuckets = this.buckets;
        this.size *= 2;
        this.buckets = Array.from({ length: this.size }, () => new Array(this.bucketSize).fill(null));
        this.count = 0;

        for (const bucket of oldBuckets) {
        for (const fp of bucket) {
            if (fp !== null) {
            this.insert(fp);
            }
        }
        }
    }

    contains(value) {
        const fp = this.fingerprint(value);
        const i1 = this.index1(fp);
        const i2 = this.index2(fp, i1);
        return this.buckets[i1].includes(fp) || this.buckets[i2].includes(fp);
    }

    delete(value) {
        const fp = this.fingerprint(value);
        const i1 = this.index1(fp);
        const i2 = this.index2(fp, i1);

        for (const i of [i1, i2]) {
        const index = this.buckets[i].indexOf(fp);
        if (index !== -1) {
            this.buckets[i][index] = null;
            this.count--;
            return true;
        }
        }

        return false;
    }

    static compress(inputStr) {
        const encoder = new TextEncoder();
        return deflate(encoder.encode(inputStr));
    }

    static decompress(compressed) {
        const decompressed = inflate(compressed);
        const decoder = new TextDecoder();
        return decoder.decode(decompressed);
    }

    serialize() {
        const data = JSON.stringify({
        size: this.size,
        bucketSize: this.bucketSize,
        fingerprintSize: this.fingerprintSize,
        maxKicks: this.maxKicks,
        buckets: this.buckets
        });
        const compressed = CuckooFilter.compress(data);
        let binary = '';
        for (let i = 0; i < compressed.length; i++) {
        binary += String.fromCharCode(compressed[i]);
        }
        return btoa(binary);
    }

    static deserialize(base64Str) {
        const binary = atob(base64Str);
        const compressed = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
        compressed[i] = binary.charCodeAt(i);
        }
        const jsonStr = CuckooFilter.decompress(compressed);
        const data = JSON.parse(jsonStr);
        const filter = new CuckooFilter(data.size, data.bucketSize, data.fingerprintSize, data.maxKicks);
        filter.buckets = data.buckets;
        return filter;
    }
}

if (window.location.server.DASAware) {
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
        const eventToBind = aThing.getAttribute('when') || 'focusout';
        aThing.addEventListener(eventToBind, ( theEvent ) => {
            if ( aThing instanceof HTMLTextAreaElement) aThing.innerText = aThing.value;
            aThing.PUT();
        })
    });

    SelectorSubscriber.subscribe(':is(input)[method=put]', (anInput) => {
        anInput.addEventListener('change', ( theEvent ) => {
            anInput.setAttribute('value', anInput.value);
            const response = theEvent.target.PUT();
        });
    });

    SelectorSubscriber.subscribe(':is([method=put]) input[type=checkbox]', (anInput) => {
        anInput.addEventListener('change', (theEvent) => {
            console.log('changing', anInput);
            if (anInput.checked) anInput.setAttribute('checked', true);
            else anInput.removeAttribute('checked');
            anInput.closest('[method=put]').PUT();
        });
    })
} else {
    console.log('not dom aware')
}
