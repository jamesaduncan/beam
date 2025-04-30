import { range, responseRange } from "jsr:@oak/commons/range";
import { JSDOM } from "npm:jsdom"
import { fileForContext } from "../beam/utils.mjs";

import * as DenoDOM from "jsr:@b-fuze/deno-dom";

import EnhancedMutationRecord from "https://jamesaduncan.github.io/dom-mutation-record/index.mjs";

/*
To do:

    - hold scripts on the server side for each document, so for example, attaching a mutation observer
    to the document on the server-side, which could then fire off changes to a database if needed,
    or update other documents.

    - a GET on a directory with a selector should be able to get an HTML document representing a list
    of those resources.

    - that same GET should be able to be filtered somehow, to provide only those resources that
    we really want
*/
function docToString(doc) {
    return `<!DOCTYPE ${doc.doctype.name}>\n${doc.documentElement.outerHTML}`;
}

/* we want a selector property on the request - in a DOM aware webserver, being able
    to know the selector the request is talking about is essential */
Object.defineProperty( Request.prototype, 'selector', {
    get() {
        if (this._selector) return this._selector;
        const range = this.headers.get('range');
        if ( !range ) return null;

        const [,selector] = range.match(/^selector=(.+)$/);
        this._selector = selector;
        return selector
    }
});

const createCustomEvent = (dom, name, opts = {}) => {
    const e = dom.createEvent('HTMLEvents');
    e.detail = opts.detail;
    e.initEvent(name, opts.bubbles, opts.cancelable);
    return e;
};

class DOMServer {
    static serializeDOM( req, doc ) {
        const body = `<!DOCTYPE ${doc.doctype?.name || 'html'}>\n${doc.documentElement.outerHTML}`;
        const encodedBody = new TextEncoder().encode( body );
        return encodedBody;
    }

    static writeDOM( req, doc ) {
        const body = `<!DOCTYPE ${doc.doctype.name}>\n${doc.documentElement.outerHTML}`;
        const encodedBody = new TextEncoder().encode( body );
        Deno.writeFile( req.file.name, encodedBody )
    }

    static async readDOM( req, config, context ) {
        const localStorage = this.localStorage;

        const buf = new Uint8Array(req.file.info.size);
        const decoder = new TextDecoder();
        await req.file.handle.read(buf);
        const dom    = new JSDOM( decoder.decode( buf ), {
            url: req.url,
            contentType: 'text/html',
            includeNodeLocations: true,
            storageQuota: 5000000,
            runScripts: "dangerously",
            resources: "usable",
            pretendToBeVisual: true
        });
        /* copy some data in to the session */
        if ( context.user ) {
            dom.window.sessionStorage.setItem("user", context.user);
        }
        Object.defineProperty(dom.window, "localStorage", {
            value: localStorage
        });
        const theEvent = createCustomEvent(dom.window.document, 'DASDocumentRead', { bubbles: true, cancelable: true, detail: {
            request: req,
        }});
        dom.window.document.dispatchEvent(theEvent);

        return dom.window.document;
    }

    static prepareHeaders( req ) {
        if (!req) throw new Error('Cannot prepareHeaders without request parameter');
        const headers = { "accept-ranges": "bytes", "content-type": req.file.mimetype, 'Access-Control-Allow-Origin': '*'};
        if ( headers["content-type"] == "text/html" ) {
            headers["accept-ranges"] += ", selector"
        }
        return headers;
    }

    static async HEAD( req, config, context ) {
        const headers = this.prepareHeaders( req );
        return new Response(null, {
            headers: {
            ...headers,
            "content-length": String(fileInfo.size),
            },
        });        
    }

    static async OPTIONS( req, config, context ) {
        const headers = this.prepareHeaders( req );
        const response =  new Response(null, {
            status: 200,
            headers: {
                "Allow": "OPTIONS, GET, HEAD, PUT, PATCH",
                ...headers
            }
        });
        return response;
    }

    static async PATCH( req, config, context ) {
        const headers = this.prepareHeaders( req );

        const emrJSON = await req.text();
        const emr = EnhancedMutationRecord.fromJSON( emrJSON );

        const doc = await this.readDOM(req, config, context);

        emr.mutate( doc );

        this.writeDOM( req, doc )

        return new Response(null, {
            status: 204,
            statusText: 'No Content',
            headers: {
                ...headers
            }
        });
    }

    static async DELETE( req, config, context ) {
        const headers = this.prepareHeaders(req);

        const selector = req.selector;
        if ( selector ) {
            const doc = await this.readDOM(req, config, context);

            const elem = doc.querySelector(selector);                
            const parent = elem.parentNode;

            const theEvent = createCustomEvent(doc, 'HTTPDelete', { bubbles: true, cancelable: true, detail: {
                request: req,
            }});
            elem.dispatchEvent(theEvent);
            parent.removeChild( elem );

            this.writeDOM( req, doc );
            
            return new Response(null, {
                status: 204,
                statusText: 'No Content',
                headers: {
                    ...headers,
                },
            });
        }                                 
    }

    static async GET( req, config, context ) {
        const headers = this.prepareHeaders( req );
        const selector = req.selector
        if ( selector ) {
            const doc = await this.readDOM(req, config, context)
            const node = doc.querySelector( selector );
            return new Response(new TextEncoder().encode( node.outerHTML ), {
                headers: {
                    ...headers,
                    "content-length": String(encodedContent)
                }
            })
        } else {
            if ( req.file.mimetype === 'text/html' ) {            
                const doc = await this.readDOM(req, config, context)
                const result = await range(req, req.file.info);
                if (result.ok) {                
                    try {
                        const theEvent = createCustomEvent(doc, 'HTTPGet', { bubbles: true, cancelable: true, detail: {
                            request: req,
                        }});
                        doc.dispatchEvent(theEvent);
                    } catch(e) {
                        console.log("couldn't dispatch event: ", e);
                    }                                
                    if (result.ranges) {
                        const body = this.serializeDOM( req, doc );
                        return responseRange(body, req.file.info.size, result.ranges, {
                            headers,
                        }, { type });
                    } else {
                        const body = this.serializeDOM( req, doc );
                        return new Response(body, {
                            headers: {
                                ...headers,
                                "content-length": String(body.length),
                            },
                        });
                    }
                }
            }  else {
                const result = await range(req, req.file.info);
                if (result.ok) {                
                    if ( result.ranges ) {
                        return responseRange(req.file.handle.readable, req.file.info.size, result.ranges, {
                            headers,
                        }, { type });
                    } else {
                        const response = new Response(req.file.handle.readable, {
                            headers: {
                                ...headers,
                                "content-length": String(req.file.info.size),
                            }
                        });
                        return response;
                    }
                } else {
                    return new Response(null, {
                        status: 416,
                        statusText: "Range Not Satisfiable",
                        headers,
                    });
                }
            }
        }
    }

    static async PUT( req, config, context ) {
        const headers = this.prepareHeaders( req );

        const selector = req.selector;
        if ( selector ) {
            const doc = await this.readDOM( req, config, context );
            const content = await req.text();
            // make sure it is actually a thing
            const fastdom = new DenoDOM.DOMParser().parseFromString( content, "text/html" );
            if ( fastdom ) {
                // somewhat annoyingly, this is a more reliable method than using an actual parser.                
                //const detagged = content.replace(/(^<([a-zA-Z]+)[^>]*>)|(<\/\2>$)/,'');
                const theElement = doc.querySelector( selector );
                // We set outerHTML so that document.querySelector('p').PUT() works, for example.
                // will this work internally? we'll see.
                theElement.outerHTML = content;//detagged; 
                const theEvent = createCustomEvent(doc, 'HTTPPut', { bubbles: true, cancelable: true, detail: {
                    request: req,
                }});
                //doc.querySelector( selector ).dispatchEvent( theEvent );
                theElement.dispatchEvent( theEvent );
            } else {
                console.log("parse failed.");
            }

            const body = docToString( doc );
            const encodedBody = new TextEncoder().encode( body );
            Deno.writeFile( req.file.name, encodedBody );
            
            const encodedContent = new TextEncoder().encode( content );
            return new Response(encodedContent, {
                headers: {
                    ...headers,
                    "content-length": String(encodedContent.byteLength),
                },
            });                
        }
    }
}

export default async function( ctx ) {
    const req = ctx.request;
    const url = new URL(req.url); 

    const localStorage = this.dom?.LocalStorage || { module: './dom/localStorage/memory.mjs' }
    const mod = await import( localStorage.module );
    DOMServer.localStorage = await mod.default.createStorage( this.dom?.LocalStorage || {} );

    try {
        await fileForContext(this, ctx);

        if ( DOMServer[req.method]) {
            try {
                return DOMServer[ req.method ]( req, this, ctx );
            } catch(e) {
                console.log("error: ", e);
                return new Response(`<h1>Internal Server Error</h1><p>${e}</p>`, {
                    status:500,
                    statusText: 'Internal Server Error'
                })
            }
        }

        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
    } catch(e) {
        switch (e.code) {
            case "ENOENT":
                return new Response("Not Found", { status: 404, statusText: "Not Found"});
        }
        console.log(`Unhandled error`, e);
    }
};

