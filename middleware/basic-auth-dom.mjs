import * as path from "jsr:@std/path";
import { JSDOM } from "npm:jsdom"
import { decodeBase64 } from "jsr:@std/encoding/base64";

const createCustomEvent = (dom, name, opts = {}) => {
    const e = dom.createEvent('HTMLEvents');
    e.detail = opts.detail;
    e.initEvent(name, opts.bubbles, opts.cancelable);
    return e;
};

class Authenticator {
    constructor( configuration ) {
        const dom = new JSDOM( Deno.readFileSync( path.join( configuration.root, '.auth.html' ) ), {
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
    }

    fail() {
        const headers = new Headers();
        headers.set('WWW-Authenticate', `Basic realm=Beam"}"`)
        const response = new Response("Unauthorized", {
            status: 401,
            headers
        });
        return response;        
    }

    async authenticate( context ) {
        const req = context.request;
        const url = new URL(req.url);
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return null;
        }
        const [type, auth] = authHeader.split(' ');
        if ( type === 'Basic') {
            const decoder = new TextDecoder();
            const [ username, password ]  = decoder.decode( decodeBase64( auth ) ).split(':');
            try {
                console.log(`authenticating ${username}:${password}`);
                const user = await this.dom.window.User.authenticate(username, password);

                if ( req.method === 'OPTIONS') {
                    return true;
                }

                if ( user.can(context.request.method, url.pathname.slice(1) )) {
                    console.log('user can!')
                    return user;
                } else {
                    console.log(`${req.method} ${user.username} cannot ${req.url}`);
                    return false;
                }
            } catch(e) {
                console.log("got an error... weird...",e);
            }
        }
    }
}


let a18n;

const def = async function( ctx ) {
    const req = ctx.request;
    const url = new URL(req.url);
    const user = await a18n.authenticate( ctx );
    if ( user )
        return true;
    else
        return a18n.fail();
};

def.setup = ( configuration ) => {
    a18n ||= new Authenticator( configuration );    
}

export default def;