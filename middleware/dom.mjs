import { range, responseRange } from "jsr:@oak/commons/range";
import { typeByExtension } from "jsr:@std/media-types/type-by-extension";
import { extname } from "jsr:@std/path/extname";
import * as path from "jsr:@std/path";
import { DOMParser, Document } from "jsr:@b-fuze/deno-dom";

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

        if (req.method === "PATCH") {
            let selector;
            if ( [,selector] = req.headers.get('range').match(/^selector=(.+)$/) ) {
                const buf = new Uint8Array(fileInfo.size);
                const decoder = new TextDecoder();
                await file.read(buf);
                const doc     = new DOMParser().parseFromString( decoder.decode( buf ), "text/html" );
                const content = await req.text();
                const test    = new DOMParser().parseFromString( content, "text/html" );
                if ( test ) {
                    doc.querySelector( selector ).outerHTML = content;
                }

                const body = `<!DOCTYPE ${doc.doctype.name}>\n${doc.documentElement.outerHTML}`;
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
        return new Response(null, { status: 405, statusText: "Method Not Allowed" });
    } catch(e) {
        switch (e.code) {
            case "ENOENT":
                return new Response("Not Found", { status: 404, statusText: "Not Found"});
        }
        console.log(`Unhandled error`, e);
    }
};

