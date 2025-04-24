import { range, responseRange } from "jsr:@oak/commons/range";
import { typeByExtension } from "jsr:@std/media-types/type-by-extension";
import { extname } from "jsr:@std/path/extname";
import * as path from "jsr:@std/path";

import { fileForContext } from "../beam/utils.mjs";


/*
    this is derived from https://jsr.io/@oak/commons/doc/range for the time being
*/
export default async function( ctx ) {
    const req = ctx.request;
    const url = new URL(req.url); 
    try {
        const file = await fileForContext( this, ctx );
        const headers = { "accept-ranges": "bytes", "content-type": typeByExtension( extname( url.pathname  )) };
        if (req.method === "HEAD") {
            return new Response(null, {
                headers: {
                ...headers,
                "content-length": String(file.info.size),
                },
            });
        }
        if (req.method === "GET") {
            const result = await range(req, file.info);
            if (result.ok) {
                if (result.ranges) {
                    return responseRange(file, file.info.size, result.ranges, {
                        headers,
                    }, { type });
                } else {
                    return new Response(file.handle.readable, {
                        headers: {
                            ...headers,
                            "content-length": String(file.info.size),
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

