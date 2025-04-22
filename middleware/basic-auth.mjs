import { parse } from "jsr:@std/toml";
import * as path from "jsr:@std/path";
import * as BeamUtil from "../beam/utils.mjs";
import { decodeBase64 } from "jsr:@std/encoding/base64";

class Authorization {
    #file;
    #configuration;
    #context;

    static configFilename( config, req ) {
        const url = new URL(req.url); 
        const pathargs = [ config.root, url.pathname ];
    
        let directory = "";
        if ( url.pathname.split().pop() == '/') directory = url.pathname;
        else {
            directory = path.dirname( url.pathname )
        }
        const authfile = path.join( ...pathargs, directory, ".auth.conf" );
        return authfile;
    }

    static async #fromFile( aFilename ) {
        try {
            const configData  = await parse( Deno.readTextFileSync( aFilename ) );
            const object = new this();
            Object.assign(object, configData);
            return object;
        } catch(e) {
            return Object.assign(new this(), { default: true });
        }
    }

    static async fromContext( configuration, ctx ) {
        const req = ctx.request;
        req.file   = await BeamUtil.default.fileForContext( configuration, ctx );
        console.log(`file is ${req.file.name}`)
        const auth = await this.#fromFile( await this.configFilename(configuration, req) );
        console.log('got configuration')
        auth.configure( configuration, ctx )
        console.log(`going to return auth`)
        return auth;
    }

    configure( configuration, context ) {
        console.log('going to store configuration')
        this.#configuration = configuration;
        this.#context = context;
        this.#file    = context.request.file;
    }

    checkAuthChunk( chunk, user, currentState ) {
        let authorized = (Reflect.has(chunk, 'default')) ? chunk.default : currentState;
        if ( chunk[ user ] != null ) {
            authorized = chunk[ user ]
        }
        return authorized;
    }

    ok( aRequest ) {
        let authorized = this.default;
        const url = new URL(aRequest.url); 

        console.log(`in ok for ${url}`)

        const authHeader = aRequest.headers.get('Authorization');        
        console.log('got headers');
        if (!authHeader && this.default === false) return false;

        const [type, auth] = authHeader.split(' ');

        let user = null;
        if ( type === 'Basic') {
            const decoder = new TextDecoder();
            const [ username, password ]  = decoder.decode( decodeBase64( auth ) ).split(':');
            if ( this.users[ username ] && this.users[username] === password ) {
                user = username;
            }
        }

        console.log( `Path is '${path.basename( url.pathname )}'`);
        console.log( `Auth is`, this)

        const pathElements = url.pathname.split( path.DELIMITER );
        authorized = this.checkAuthChunk( this[ url.pathname ], user, authorized )

        return authorized;
    }
}

export default async function( ctx ) {
    const req = ctx.request;
    const url = new URL(req.url); 
    console.log( `request for ${url}`)
    const auth = await Authorization.fromContext( this, ctx );
    console.log("got auth", auth);
    if (!auth.ok( req )) {
        console.log(`request for ${url} no good! auth failed.`);
        const headers = new Headers();
        headers.set('WWW-Authenticate', `Basic realm="${auth._realm}"`)
        const response = new Response("Unauthorized", {
            status: 401,
            headers
        });
        return response;
    } else {
        console.log(`no need to return anything. request for ${url} is a-ok!`);
    }
};

