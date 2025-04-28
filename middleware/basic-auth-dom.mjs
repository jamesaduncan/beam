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

        if ( req.method === 'OPTIONS') { // really, this should check what this user can do, and only return it.
            return true;
        }

        let username = "";
        let password = "";
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            console.log("No authorization header, ignoring");
        } else {
            if ( authHeader ) {
                const [type, auth] = authHeader.split(' ');
                if ( type === 'Basic' ) {       
                    [ username, password ]  = ( new TextDecoder() ).decode( decodeBase64( auth ) ).split(':');
                }
            }
        }

        if ( this.dom.window.User.can(username, context.request.method, url.pathname) ) {
            console.log(`${username} can ${url.pathname}`);

            // this user can do it, if it's a valid user.            
            const user = await this.dom.window.User.authenticate(username, password);
            if ( user ) return user;
        }
        
        // ok, so we do have a user but we "can't" so we need to check groups, and then finally we need to check the "everybody" group
        return this.dom.window.User.groupsFor( username ).reduceRight( (truth, groupname) => {
            console.log(`checking to see if ${groupname} has access to ${context.request.method} ${url.pathname}`);
            truth = this.dom.window.User.can(groupname, context.request.method, url.pathname);
            return truth;
        }, false);            
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