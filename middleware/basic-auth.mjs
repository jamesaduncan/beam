import { parse } from "jsr:@std/toml";
import * as path from "jsr:@std/path";
import * as BeamUtil from "../beam/utils.mjs";
import { decodeBase64 } from "jsr:@std/encoding/base64";

class User {
    username;
    groups = [];    

    constructor( { username, groups } = { username: '', groups: [] } ) {
        this.username = username;
        this.groups = groups;
    }

    toString() {
        return this.username;
    }
}

class Authentication {
    static authenticate( configuration, context ) {
        const req = context.request;

        const authHeader = req.headers.get('Authorization');
        const [type, auth] = authHeader.split(' ');

        if ( type === 'Basic') {
            const decoder = new TextDecoder();
            const [ username, password ]  = decoder.decode( decodeBase64( auth ) ).split(':');
            if ( configuration?.users[ username ] == password ) {
                const myGroups = [];
                for ( const [groupname, groupmembers] of Object.entries( configuration.groups ) ) {                    
                    if ( groupmembers.includes( username )) myGroups.push( groupname )
                }
                return new User({ username: username, groups: myGroups })
            }
        }
        return null;
    }
}

class Authorization {
    #file;
    #configuration;
    #context;

    static async fromContext( configuration, ctx ) {
        const req = ctx.request;
        req.file   = await BeamUtil.default.fileForContext( configuration, ctx );
        const auth = Object.assign( new this(), {
            "#realm": "Beam",

            users: {
                james: 'secret'
            },
            
            default: true,

            '/foo/bar.html': { james: false }
        });

        auth.#configuration = configuration;
        auth.#context = ctx;
        auth.#file = ctx.request.file;

        return auth;
    }

    checkAuthChunk( chunk, user, currentState ) {
        let authorized = (Reflect.has(chunk, 'default')) ? chunk.default : currentState;
        if ( chunk[ user ] != null ) {
            authorized = chunk[ user ]
        }
        return authorized;
    }
    
    authn( aRequest ) {
    }

    ok( aRequest ) {
        console.log( this );


        let authorized = this.default;
        const url = new URL(aRequest.url); 

        const authSection = this[ url.pathname ];
        if ( !authSection && this.default === false ) {
            return false;
        }


        const authHeader = aRequest.headers.get('Authorization');
        if (!authHeader && authSection?.default === false) return false;
        if ( authSection?.default === true ) {            
            return true;
        }

        const [type, auth] = authHeader.split(' ');

        let user = null;
        if ( type === 'Basic') {
            const decoder = new TextDecoder();
            const [ username, password ]  = decoder.decode( decodeBase64( auth ) ).split(':');
            if ( this.users[ username ] && this.users[username] === password ) {
                user = username;
            }
        }
        authorized = this.checkAuthChunk( this[ url.pathname ], user, authorized )

        return authorized;
    }
}

export default async function( ctx ) {
    const req = ctx.request;
    const url = new URL(req.url); 
    console.log( `request for ${url}`)
    const user = await Authentication.authenticate( this, ctx );
    console.log(`User is ${user}`, user);
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

