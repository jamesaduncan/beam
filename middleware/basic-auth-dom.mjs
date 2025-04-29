import * as path from "jsr:@std/path";
import { JSDOM } from "npm:jsdom"
import { decodeBase64 } from "jsr:@std/encoding/base64";

import { debounce } from "jsr:@std/async/debounce";

const createCustomEvent = (dom, name, opts = {}) => {
    const e = dom.createEvent('HTMLEvents');
    e.detail = opts.detail;
    e.initEvent(name, opts.bubbles, opts.cancelable);
    return e;
};

class Authenticator {
    constructor( configuration ) {
        const pathToAuthFile = path.join( configuration.root, '.auth.html' );
        
        this.authFile = pathToAuthFile;
        this.readDom();

    }

    readDom() {
        const dom = new JSDOM( Deno.readFileSync( this.authFile ), {
            url: "file:///.auth.html",
            contentType: 'text/html',
            includeNodeLocations: true,
            storageQuota: 5000000,
            runScripts: "dangerously",
            resources: "usable",
            pretendToBeVisual: true
        });
        this.dom = dom;
        dom.window.TextEncoder = TextEncoder;
        dom.window.crypto = crypto;
        dom.window.crypto.subtle = crypto.subtle;
        dom.window.Response = Response;
    }

    fail( message ) {
        const headers = new Headers();
        headers.set('WWW-Authenticate', `Basic realm=Beam"}"`)
        const response = new Response(`Unauthorized: ${message}`, {
            status: 401,
            headers
        });
        return response;        
    }

    async authenticate( context ) {
        const req = context.request;
        const url = new URL(req.url);

        if ( req.method === 'OPTIONS') { // really, this should check what this user can do, and only return it.
            return true;
        }

        return this.dom.window.Authenticator.authenticate( req )
    }
}


let a18n;

const def = async function( ctx ) {
    const req = ctx.request;
    const url = new URL(req.url);
    return await a18n.authenticate( ctx );
    /*
    const user = await a18n.authenticate( ctx );
    if ( user )
        return true;
    else
        return a18n.fail();
    */
};

def.setup = async ( configuration ) => {
    a18n ||= new Authenticator( configuration );    

    const rebuild = debounce( () => {
        a18n = new Authenticator( configuration )
    }, 200);

    const watcher = Deno.watchFs( a18n.authFile );
    for await ( const event of watcher ) {
        rebuild(event);
    }

}

export default def;