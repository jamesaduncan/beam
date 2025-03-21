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
/*
    this is derived from https://jsr.io/@oak/commons/doc/range for the time being
*/
export default async function( ctx ) {
    const req = ctx.request;
    const url = new URL(req.url); 
    try {
        const pathargs = [ this.root, url.pathname ];

        if ( this.index )
            if ( url.pathname.split().pop() == '/') pathargs.push(this.index);

        const filename = path.join( ...pathargs );
        const file = await Deno.open( filename );
        const fileInfo = await file.stat();
        const headers = { "accept-ranges": "bytes", "content-type": typeByExtension( extname( filename )) };
        if ( headers["content-type"] == "text/html" ) {
            headers["accept-ranges"] += ", selector"
        }

        if (req.method === "HEAD") {
            return new Response(null, {
                headers: {
                ...headers,
                "content-length": String(fileInfo.size),
                },
            });
        }

        if (req.method === "DELETE") {
            let selector;
            if ( [,selector] = req.headers.get('range').match(/^selector=(.+)$/) ) {
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

        if (req.method === "PATCH") {
            const emrJSON = await req.text();
            const emr = EnhancedMutationRecord.fromJSON( emrJSON );
            const fileContents = new Uint8Array(fileInfo.size);
            const decoder = new TextDecoder();
            await file.read(fileContents);

            /* we have to use JSDOM here, because deno-dom doesn't have document.evaluate */
            const dom    = new JSDOM( decoder.decode( fileContents ) );
            const doc    = dom.window.document;
            
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
            })
        }

        /* this is a PUT with a range */
        if (req.method === "PUT") {
            let selector;
            if ( [,selector] = req.headers.get('range').match(/^selector=(.+)$/) ) {
                const buf = new Uint8Array(fileInfo.size);
                const decoder = new TextDecoder();
                await file.read(buf);
                const doc     = new DenoDOM.DOMParser().parseFromString( decoder.decode( buf ), "text/html" );
                const content = await req.text();
                const test    = new DenoDOM.DOMParser().parseFromString( content, "text/html" );
                if ( test ) {
                    doc.querySelector( selector ).outerHTML = content;
                }

                const body = docToString( doc );
                const encodedBody = new TextEncoder().encode( body );
                Deno.writeFile( filename, encodedBody );
                
                const encodedContent = new TextEncoder().encode( content );
                return new Response(encodedContent, {
                    headers: {
                        ...headers,
                        "content-length": String(encodedContent.byteLength),
                    },
                });                
            }
        }

        if (req.method === "GET") {
            let selector;
            if ( req.headers.get('range'))
                [,selector] = req.headers.get('range').match(/^selector=(.+)$/);

            if ( selector ) {
                const buf = new Uint8Array(fileInfo.size);
                const decoder = new TextDecoder();
                await file.read(buf);
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
                const result = await range(req, fileInfo);
                if (result.ok) {
                    if (result.ranges) {
                        return responseRange(file, fileInfo.size, result.ranges, {
                            headers,
                        }, { type });
                    } else {
                        return new Response(file.readable, {
                            headers: {
                                ...headers,
                                "content-length": String(fileInfo.size),
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
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
    } catch(e) {
        switch (e.code) {
            case "ENOENT":
                return new Response("Not Found", { status: 404, statusText: "Not Found"});
        }
        console.log(`Unhandled error`, e);
    }
};

