import JsRuntime from "../../../../utils/JsRuntime";
import ObjectUtils from "../../../../utils/ObjectUtils";

import { CborString, CanBeCborString, forceCborString } from "../../../../cbor/CborString";
import { ToCbor } from "../../../../cbor/interfaces/CBORSerializable";
import { Cbor } from "../../../../cbor/Cbor";
import { CborObj } from "../../../../cbor/CborObj";
import { CborArray } from "../../../../cbor/CborObj/CborArray";
import { InvalidCborFormatError } from "../../../../errors/InvalidCborFormatError";
import { Cloneable } from "../../../../types/interfaces/Cloneable";
import { ToJson } from "../../../../utils/ts/ToJson";
import { Hash32 } from "../../../hashes/Hash32/Hash32";
import { Signature } from "../../../hashes/Signature";
import { VKey } from "./VKey";

export class VKeyWitness
    implements ToCbor, Cloneable<VKeyWitness>, ToJson
{
    readonly vkey!: VKey
    readonly signature!: Signature

    constructor( vkey: Hash32, signature: Signature )
    {
        JsRuntime.assert(
            vkey instanceof Hash32,
            "can't construct 'VKeyWitness' without a 'VKey' as first argument"
        );
        ObjectUtils.defineReadOnlyProperty(
            this,
            "vkey",
            vkey
        );

        JsRuntime.assert(
            signature instanceof Signature,
            "can't construct 'VKeyWitness' without a 'Signature' as second argument"
        );
        ObjectUtils.defineReadOnlyProperty(
            this,
            "signature",
            signature
        );
    }

    clone(): VKeyWitness
    {
        return new VKeyWitness(
            new VKey( this.vkey ),
            new Signature( this.signature )
        )
    }
    
    toCbor(): CborString
    {
        return Cbor.encode( this.toCborObj() );
    }
    toCborObj(): CborObj
    {
        return new CborArray([
            this.vkey.toCborObj(),
            this.signature.toCborObj()
        ])
    }

    static fromCbor( cStr: CanBeCborString ): VKeyWitness
    {
        return VKeyWitness.fromCborObj( Cbor.parse( forceCborString( cStr ) ) );
    }
    static fromCborObj( cObj: CborObj ): VKeyWitness
    {
        if(!(cObj instanceof CborArray))
        throw new InvalidCborFormatError("VKeyWitness");

        return new VKeyWitness(
            Hash32.fromCborObj( cObj.array[0] ),
            Signature.fromCborObj( cObj.array[1] )
        );
    }

    toJson()
    {
        return {
            vkey: this.vkey.asString,
            signature: this.signature.asString
        }
    }
}