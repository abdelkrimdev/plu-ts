import JsRuntime from "../../utils/JsRuntime";
import ObjectUtils from "../../utils/ObjectUtils";
import UPLCFlatUtils from "../../utils/UPLCFlatUtils";

import { byte, decodeBech32, encodeBech32 } from "../../crypto";
import { nothingData, justData } from "../../types/Data/toData/maybeData";
import { BasePlutsError } from "../../errors/BasePlutsError";
import { NetworkT } from "../ledger/Network";
import { PaymentCredentials, PaymentCredentialsType } from "../credentials/PaymentCredentials";
import { StakeCredentials, StakeCredentialsType } from "../credentials/StakeCredentials";
import { Hash28 } from "../hashes/Hash28/Hash28";
import { forceBigUInt } from "../../types/ints/Integer";
import { ToCbor } from "../../cbor/interfaces/CBORSerializable";
import { CborString, CanBeCborString, forceCborString } from "../../cbor/CborString";
import type { ToData } from "../../types/Data/toData/interface"
import { Data } from "../../types/Data/Data";
import { DataConstr } from "../../types/Data/DataConstr";
import { Cloneable } from "../../types/interfaces/Cloneable";
import { CborObj } from "../../cbor/CborObj";
import { CborBytes } from "../../cbor/CborObj/CborBytes";
import { Cbor } from "../../cbor/Cbor";
import { ToJson } from "../../utils/ts/ToJson";
import { InvalidCborFormatError } from "../../errors/InvalidCborFormatError";
import { hexToBytes } from "../../crypto/utils/hexToBytes";
import { bytesToHex } from "../../crypto/utils/bytesToHex";

export type AddressStr = `${"addr1"|"addr_test1"}${string}`;

export function isAddressStr( stuff: any ): stuff is AddressStr
{
    if( typeof stuff !== "string" ) return false;
    
    try {
        Address.fromString( stuff );
        return true;
    } catch {
        return false;
    }
}

export type AddressType
    = "base"
    | "pointer"
    | "enterprise"
    | "bootstrap"
    | "unknown"

/**
 * shelley specification in cardano-ledger; page 113
 */
export class Address
    implements ToData, Cloneable<Address>, ToCbor, ToJson
{
    readonly network!: NetworkT
    readonly paymentCreds!: PaymentCredentials
    readonly stakeCreds?: StakeCredentials
    readonly type!: AddressType;

    constructor(
        network: NetworkT,
        paymentCreds: PaymentCredentials,
        stakeCreds?: StakeCredentials,
        type?: AddressType
    )
    {
        type = type === undefined ? 
            (stakeCreds === undefined ? "enterprise" : "base")
            : type;
        JsRuntime.assert(
            type === "base"         ||
            type === "enterprise"   ||
            type === "bootstrap"    ||
            type === "pointer",
            "invalid address type"
        );
        ObjectUtils.defineReadOnlyProperty(
            this, "type", type
        );

        JsRuntime.assert(
            network === "mainnet" || network === "testnet",
            "invalid network"
        );
        ObjectUtils.defineReadOnlyProperty(
            this, "network", network
        );

        JsRuntime.assert(
            paymentCreds instanceof PaymentCredentials,
            "invalid payment credentials"
        );
        ObjectUtils.defineReadOnlyProperty(
            this, "paymentCreds", paymentCreds.clone()
        );

        JsRuntime.assert(
            stakeCreds === undefined || stakeCreds instanceof StakeCredentials,
            "invalid stake credentials"
        );
        ObjectUtils.defineReadOnlyProperty(
            this, "stakeCreds", stakeCreds?.clone()
        );

    }

    clone(): Address
    {
        return new Address(
            this.network,
            this.paymentCreds, // cloned in constructor
            this.stakeCreds,   // cloned in constructor
            this.type
        );
    }

    static get fake(): Address
    {
        return new Address(
            "mainnet",
            PaymentCredentials.fake
        );
    }

    toData(): Data
    {
        return new DataConstr(
            0, // export has only 1 constructor,
            [
                this.paymentCreds.toData(),
                this.stakeCreds === undefined ?
                    nothingData() :
                    justData( this.stakeCreds.toData() )
            ]
        )
    }

    toBytes(): byte[]
    {
        return [(
            // header byte
            // second nubble = network
            ( this.network === "mainnet" ? 0b0000_0001 : 0b0000_0000 ) |
            // first nibble infos  
            (
                this.type === "base" ?       0b0000_0000 :
                this.type === "pointer" ?    0b0100_0000 :
                this.type === "enterprise" ? 0b0110_0000 :
                0b1000 // bootstrap
            ) |
            ( this.stakeCreds?.type === "script"  ? 0b10_0000 : 0b00_0000 ) |
            ( this.paymentCreds.type === "script" ? 0b01_0000 : 0b00_0000 )
        ) as byte]
        .concat(
            Array.from( this.paymentCreds.hash.asBytes ) as byte[]
        )
        .concat(
            this.stakeCreds === (void 0) ? [] : // add nothing

            Array.isArray( this.stakeCreds.hash ) ? // pointer 
                this.stakeCreds.hash
                .reduce( ( acc, n ) =>
                    acc.concat(
                        Array.from(
                            UPLCFlatUtils.encodeBigIntAsVariableLengthBitStream(
                                forceBigUInt( n )
                            ).toBuffer().buffer
                        ) as byte[]
                    ),
                    [] as byte[]
                ) :
            // hash (script or key)
            Array.from( this.stakeCreds?.hash.asBytes ?? [] ) as byte[]
        );
    }

    static fromBytes( bs: byte[] | string ): Address
    {
        bs = typeof bs === "string" ? hexToBytes( bs ) : bs;

        const [ header, ...payload ] = bs;

        const addrType = (header & 0b1111_0000) >> 4;
        const network: NetworkT = ( (header & 0b0000_1111) ) === 1 ? "mainnet" : "testnet" ;

        const type: AddressType =
            addrType <= 0b0011  ? "base" :
            addrType <= 0b0101  ? "pointer" :
            addrType <= 0b0111  ? "enterprise" :
            addrType === 0b1000 ? "bootstrap" :
            // addrType === 0b1110 || addrType === 0b1111 ? "stake" :
            "unknown";

        let payment: byte[];
        let stake: byte[];

        const paymentType: PaymentCredentialsType = (addrType & 0b0001) === 1 ? "script": "pubKey"; 
        const   stakeType: StakeCredentialsType   = (addrType & 0b0010) === 1 ? "script": "stakeKey";

        switch( type )
        {
            case "base":
                if( payload.length !== (28 * 2) )
                throw new BasePlutsError(
                    "address' header specifies a base adress but the payload is incorrect"
                );

                payment = payload.slice( 0, 28 ),
                stake = payload.slice( 28 );
            break;
            case "bootstrap":
            case "enterprise":
            case "pointer":
                if( payload.length < 28 )
                {
                    console.log( bytesToHex( payload ) )
                    throw new BasePlutsError(
                        "address' payload is incorrect; payload.length: " + payload.length.toString()
                    );
                }

                payment = payload.slice(0,28),
                stake = []; // ignore pointer; might change in future version
            break;
            default:
                throw new BasePlutsError("unknown addres type; can't extract payload") 
        }

        if( payment.length !== 28 )
        {
            throw new BasePlutsError(
                "missing payment credentials"
            )
        }
        
        return new Address(
            network,
            new PaymentCredentials(
                paymentType,
                new Hash28( new Uint8Array( payment ) )
            ),
            stake.length === 28 ?
                new StakeCredentials(
                    stakeType,
                    new Hash28( new Uint8Array( stake ) )
                ):
                undefined,
            type
        );
    };

    toBuffer(): Uint8Array
    {
        return new Uint8Array( this.toBytes() )
    }

    static fromBuffer( buff: Uint8Array | string ): Address
    {
        return Address.fromBytes(
            typeof buff === "string" ?
            buff : 
            Array.from( buff ) as byte[]
        )
    }

    toCborObj(): CborObj
    {
        return new CborBytes( this.toBuffer() );
    }

    static fromCborObj( buff: CborObj ): Address
    {
        if(!( buff instanceof CborBytes))
        throw new InvalidCborFormatError("Address");

        return Address.fromBuffer( buff.buffer )
    }

    toCbor(): CborString
    {
        return Cbor.encode( this.toCborObj() );
    }

    static fromCbor( cbor: CanBeCborString ): Address
    {
        return Address.fromCborObj( Cbor.parse( forceCborString( cbor ) ) );
    }

    toString(): string
    {
        return encodeBech32(
            this.network === "mainnet" ? "addr" : "addr_test",
            this.toBytes()
        )
    }

    static fromString( addr: string ): Address
    {
        const [ hrp, bytes ] = decodeBech32( addr );

        let hrpNetwork: NetworkT;
        switch( hrp )
        {
            case "addr_test": 
                hrpNetwork = "testnet";
            break;
            case "addr":
                hrpNetwork = "mainnet";
            break;
            default:
                throw new BasePlutsError(
                    "string passed is not a Cardano address"
                );
        }

        const _addr = Address.fromBytes( bytes );

        if( hrpNetwork !== _addr.network )
        throw new BasePlutsError(
            "ill formed address; human readable part netwok missmatches header byte network"
        );

        return _addr;
    }

    toJson()
    {
        return this.toString();
    }
}