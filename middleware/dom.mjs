import { range, responseRange } from "jsr:@oak/commons/range";
import { typeByExtension } from "jsr:@std/media-types/type-by-extension";
import { extname } from "jsr:@std/path/extname";
import * as path from "jsr:@std/path";
import * as DenoDOM from "jsr:@b-fuze/deno-dom";
import { JSDOM } from "npm:jsdom"

import EnhancedMutationRecord from "https://jamesaduncan.github.io/dom-mutation-record/index.mjs";


function docToString(doc) {
    return `<!DOCTYPE ${doc.doctype.name}>\n${doc.documentElement.outerHTML}`;
}

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

class DOMServer {

    static prepareHeaders( req ) {
        if (!req) throw new Error('Cannot prepareHeaders without request parameter');
        const headers = { "accept-ranges": "bytes", "content-type": req.file.mimetype };
        if ( headers["content-type"] == "text/html" ) {
            headers["accept-ranges"] += ", selector"
        }
        return headers;
    }

    static async HEAD( req ) {
        const headers = this.prepareHeaders( req );
        return new Response(null, {
            headers: {
            ...headers,
            "content-length": String(fileInfo.size),
            },
        });        
    }

    static async OPTIONS( req ) {
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

    static async PATCH( req ) {
        const headers = this.prepareHeaders();

        const emrJSON = await req.text();
        const emr = EnhancedMutationRecord.fromJSON( emrJSON );
        const fileContents = new Uint8Array(fileInfo.size);
        const decoder = new TextDecoder();
        await file.read(fileContents);

        /* we have to use JSDOM here, because deno-dom doesn't have document.evaluate */
        const dom    = new JSDOM( decoder.decode( fileContents ) );
        const doc    = dom.window.document;

        try {
            emr.mutate( doc );
            const body = docToString( doc );
            const encodedBody = new TextEncoder().encode( body );
            Deno.writeFile( filename, encodedBody )
            return new Response(null, {
                status: 204,
                statusText: 'No Content',
                headers: {
                    ...headers
                }
            });
        } catch(e) {
            console.log(`error trying to patch ${filename}:`,e)
            return new Response(null, {
                status: 500,
                statusText: 'Internal Server Error',
                headers: {
                    ...headers
                }
            })
        }
    }

    static async DELETE( req ) {
        const headers = this.prepareHeaders();

        const selector = req.selector;
        if ( selector ) {
            const buf = new Uint8Array(fileInfo.size);
            const decoder = new TextDecoder();
            await file.read(buf);
            const doc    = new DenoDOM.DOMParser().parseFromString( decoder.decode( buf ), "text/html" );            
            const elem = doc.querySelector(selector);                
            elem.parentNode.removeChild( elem );

            const body = docToString( doc );
            const encodedBody = new TextEncoder().encode( body );
            Deno.writeFile( filename, encodedBody );
            return new Response(null, {
                status: 204,
                statusText: 'No Content',
                headers: {
                    ...headers,
                },
            });
        }                                 
    }

    static async GET( req ) {
        const headers = this.prepareHeaders( req );

        const selector = req.selector
        if ( selector ) {
            const buf = new Uint8Array(req.file.info.size);
            const decoder = new TextDecoder();
            await req.file.handle.read(buf);
            const doc  = new DenoDOM.DOMParser().parseFromString( decoder.decode( buf ), "text/html" );
            const node = doc.querySelector( selector );
            const encodedContent = new TextEncoder().encode( node.outerHTML );
            return new Response(encodedContent, {
                headers: {
                    ...headers,
                    "content-length": String(encodedContent)
                }
            })
        } else {
            const result = await range(req, req.file.info);
            if (result.ok) {
                if (result.ranges) {
                    return responseRange(req.file.handle, req.file.info.size, result.ranges, {
                        headers,
                    }, { type });
                } else {
                    return new Response(req.file.handle.readable, {
                        headers: {
                            ...headers,
                            "content-length": String(req.file.info.size),
                        },
                    });
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

    static async PUT( req ) {
        const headers = this.prepareHeaders( req );

        console.log( `Selector is ${req.selector}` );

        const selector = req.selector;
        if ( selector ) {
            const buf = new Uint8Array(req.file.info.size);
            const decoder = new TextDecoder();
            await req.file.handle.read(buf);

            const doc     = new DenoDOM.DOMParser().parseFromString( decoder.decode( buf ), "text/html" );
            const content = await req.text();
            const test    = new DenoDOM.DOMParser().parseFromString( content, "text/html" );
            if ( test ) {
                doc.querySelector( selector ).outerHTML = content;
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

    try {
        const pathargs = [ this.root, url.pathname ];
        if ( this.index )
            if ( url.pathname.split().pop() == '/') pathargs.push(this.index);

        req.file = {
            name: path.join( ...pathargs )
        }
        req.file.handle = await Deno.open( req.file.name );
        req.file.mimetype = typeByExtension( extname( req.file.name ))
        req.file.info   = await req.file.handle.stat();

        if ( DOMServer[req.method])
            return DOMServer[ req.method ]( req );

        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
    } catch(e) {
        switch (e.code) {
            case "ENOENT":
                return new Response("Not Found", { status: 404, statusText: "Not Found"});
        }
        console.log(`Unhandled error`, e);
    }
};

