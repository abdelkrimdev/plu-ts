import ObjectUtils from "../../../../../utils/ObjectUtils";
import { Application } from "../../../../UPLC/UPLCTerms/Application";
import { Builtin } from "../../../../UPLC/UPLCTerms/Builtin";
import { HoistedUPLC } from "../../../../UPLC/UPLCTerms/HoistedUPLC";
import { PLam, PByteString, PBool, PInt, PFn, TermFn } from "../../../PTypes";
import { Term } from "../../../Term";
import { fn, bs, bool, int, lam } from "../../../type_system";
import { papp } from "../../papp";
import { PappArg } from "../../pappArg";
import { phoist } from "../../phoist";
import { TermBS, addPByteStringMethods } from "../../std/UtilityTerms/TermBS";
import { TermBool, addPBoolMethods } from "../../std/UtilityTerms/TermBool";
import { TermInt, addPIntMethods } from "../../std/UtilityTerms/TermInt";
import { _pflipUPLC } from "../_pflipUPLC";
import { addApplications } from "../addApplications";
import { pfn } from "../../pfn";
import { genHoistedSourceUID } from "../../../../UPLC/UPLCTerms/HoistedUPLC/HoistedSourceUID/genHoistedSourceUID";



export type ByteStrBinOPToBS = Term< PLam< PByteString, PLam< PByteString, PByteString>>>
& {
    $: ( input: PappArg<PByteString> ) => 
        Term<PLam<PByteString,PByteString>>
        & {
            $: ( input: PappArg<PByteString> ) => 
                TermBS
        }
}

function byteStrBinOpToBS( builtin: Builtin )
    : ByteStrBinOPToBS
{
    const op = new Term<PLam<PByteString, PLam<PByteString, PByteString>>>(
        fn([ bs, bs ], bs ),
        _dbn => builtin
    );

    return  ObjectUtils.defineReadOnlyProperty(
        op,
        "$",
        ( fstIn: Term<PByteString> ): Term<PLam<PByteString, PByteString>> => {
            const oneIn =
                papp( op, fstIn );

            return ObjectUtils.defineReadOnlyProperty(
                oneIn,
                "$",
                ( sndIn: Term<PByteString> ): TermBS => {
                    return addPByteStringMethods( papp( oneIn as any, sndIn ) )
                }
            ) as any;
        }
    ) as any;
}

export type ByteStrBinOPToBool = Term< PLam< PByteString, PLam< PByteString, PBool>>>
& {
    $: ( input: PappArg<PByteString> ) => 
        Term<PLam<PByteString,PBool>>
        & {
            $: ( input: PappArg<PByteString> ) => 
                TermBool
        }
}

function byteStrBinOpToBool( builtin: Builtin )
    : ByteStrBinOPToBool
{
    const op = new Term<PLam<PByteString, PLam<PByteString, PBool>>>(
        fn([ bs, bs ], bool ),
        _dbn => builtin
    );

    return  ObjectUtils.defineReadOnlyProperty(
        op,
        "$",
        ( fstIn: Term<PByteString> ): Term<PLam<PByteString, PBool>> => {
            const oneIn =
                // @ts-ignore Type instantiation is excessively deep and possibly infinite
                papp( op, fstIn );

            return ObjectUtils.defineReadOnlyProperty(
                oneIn,
                "$",
                ( sndIn: Term<PByteString> ): TermBool => {
                    return addPBoolMethods( papp( oneIn as any, sndIn ) )
                }
            ) as any;
        }
    ) as any;
}

export const pappendBs = byteStrBinOpToBS( Builtin.appendByteString );
export const pconsBs: Term<PLam<PInt, PLam< PByteString, PByteString>>>
& {
    $: ( input: PappArg<PInt> ) => 
        Term<PLam<PByteString,PByteString>>
        & {
            $: ( input: PappArg<PByteString> ) => 
                TermBS
        }
} = (() => {
    const consByteString = new Term<PFn<[ PInt, PByteString], PByteString>>(
        fn([ int, bs ], bs ),
        _dbn => Builtin.consByteString
    );

    return  ObjectUtils.defineReadOnlyProperty(
        consByteString,
        "$",
        ( byte: Term<PInt> ): Term<PLam<PByteString, PByteString>> => {
            const consByteStringFixedByte = papp( consByteString, byte );

            return ObjectUtils.defineReadOnlyProperty(
                consByteStringFixedByte,
                "$",
                ( toByteString: Term<PByteString> ): TermBS => {
                    return addPByteStringMethods( papp( consByteStringFixedByte, toByteString ) )
                }
            ) as any;
        }
    ) as any;
})();

const flippedConsUID = genHoistedSourceUID();

export const flippedCons = addApplications<[ PByteString, PInt ], PByteString>( 
    new Term(
        fn([ bs, int ], bs),
        _dbn => new HoistedUPLC(
            new Application(
                _pflipUPLC.clone(),
                Builtin.consByteString
            ),
            flippedConsUID
        )
    )
);

export const psliceBs: Term<PLam<PInt, PLam< PInt, PLam< PByteString, PByteString>>>>
& {
    $: ( fromIndex: PappArg<PInt> ) => 
        Term<PLam< PInt, PLam<PByteString,PByteString>>>
        & {
            $: ( ofLength: PappArg<PInt> ) => 
                Term<PLam<PByteString,PByteString>>
                & {
                    $: ( onByteString: PappArg<PByteString> ) => TermBS
                }
        }
} = (() => {
    const sliceBs = new Term<PFn<[ PInt, PInt, PByteString ], PByteString>>(
        fn([ int, int, bs ], bs ),
        _dbn => Builtin.sliceByteString,
    );

    return ObjectUtils.defineReadOnlyProperty(
        sliceBs,
        "$",
        ( fromIndex: PappArg<PInt> ): Term<PLam< PInt, PLam<PByteString,PByteString>>>
        & {
            $: ( ofLength: PappArg<PInt> ) => 
                Term<PLam<PByteString,PByteString>>
                & {
                    $: ( onByteString: PappArg<PByteString> ) => TermBS
                }
        } =>{
            const sliceBsFromIdx = papp( sliceBs, fromIndex );
            
            return ObjectUtils.defineReadOnlyProperty(
                sliceBsFromIdx,
                "$",
                ( ofLength: Term<PInt> ): Term<PLam< PInt, PLam<PByteString,PByteString>>>
                & {
                    $: ( ofLength: Term<PInt> ) => 
                        Term<PLam<PByteString,PByteString>>
                        & {
                            $: ( onByteString: Term<PByteString> ) => TermBS
                        }
                } => {
                    const sliceBsFromIdxOfLength = papp( sliceBsFromIdx, ofLength );

                    return ObjectUtils.defineReadOnlyProperty(
                        sliceBsFromIdxOfLength,
                        "$",
                        ( onByteString: Term<PByteString> ): TermBS =>
                            addPByteStringMethods( papp( sliceBsFromIdxOfLength, onByteString ) )
                    ) as any
                }
            ) as any
        }
    )
})();

export const plengthBs :TermFn<[ PByteString ], PInt>
    = (() => {
        const lenBS = new Term<PLam< PByteString, PInt>>(
            lam( bs, int ),
            _dbn => Builtin.lengthOfByteString,
        );

        return ObjectUtils.defineReadOnlyProperty(
            lenBS,
            "$",
            ( ofByteString: PappArg<PByteString> ): TermInt =>
                addPIntMethods( papp( lenBS, ofByteString ) )
        );
    })();

export const pindexBs
    : Term<PLam<PByteString, PLam<PInt , PInt>>>
    & {
        $: ( ofByteString: PappArg<PByteString> ) =>
            Term<PLam<PInt, PInt>>
            & {
                $: ( index: PappArg<PInt> ) => TermInt
            }
    }
    = (() => {
        const idxBS = new Term<PFn<[ PByteString, PInt ], PInt>>(
                fn([ bs, int ], int ),
                _dbn => Builtin.indexByteString,
            );
        
        return ObjectUtils.defineReadOnlyProperty(
            idxBS,
            "$",
            ( ofByteString: PappArg<PByteString> ):
                Term<PLam<PInt, PInt>>
                & {
                    $: ( index: PappArg<PInt> ) => TermInt
                } =>
            {
                const idxOfBS = papp( idxBS, ofByteString );

                return ObjectUtils.defineReadOnlyProperty(
                    idxOfBS,
                    "$",
                    ( index: PappArg<PInt> ): TermInt =>
                        addPIntMethods( papp( idxOfBS, index ) )
                ) as any;
            }
        )
    })();

export const peqBs      = byteStrBinOpToBool( Builtin.equalsByteString );
export const plessBs    = byteStrBinOpToBool( Builtin.lessThanByteString );
export const plessEqBs  = byteStrBinOpToBool( Builtin.lessThanEqualsByteString );

export const pgreaterBS: ByteStrBinOPToBool =
    phoist(
        pfn([ bs, bs ], bool )(
            ( a: Term<PByteString>, b: Term<PByteString> ): TermBool => plessBs.$( b ).$( a )
        )
    ) as any;

export const pgreaterEqBS: ByteStrBinOPToBool =
    phoist(
        pfn([ bs, bs ], bool )(
            ( a: Term<PByteString>, b: Term<PByteString> ): TermBool => plessEqBs.$( b ).$( a )
        )
    ) as any;

export const psha2_256: TermFn<[ PByteString ], PByteString> =
    addApplications<[ PByteString ], PByteString>(
        new Term(
            lam( bs, bs ),
            _dbn => Builtin.sha2_256
        )
    );
export const psha3_256: TermFn<[ PByteString ], PByteString> =
    addApplications<[ PByteString ], PByteString>(
        new Term(
            lam( bs, bs ),
            _dbn => Builtin.sha3_256
        )
    );
export const pblake2b_256: TermFn<[ PByteString ], PByteString> =
    addApplications<[ PByteString ], PByteString>(
        new Term(
            lam( bs, bs ),
            _dbn => Builtin.blake2b_256
        )
    );

/**
 * performs cryptographic signature verification using the Ed25519 scheme
 * 
 * @param {PByteString} key ```PByteString``` of length 32 ( ```PubKeyHash``` )
 * @param {PByteString} message abitrary length ```PByteString```
 * @param {PByteString} signature ```PByteString``` of length 64
 * @returns {PBool} 
 * 
 * @throws
 * @fails
 */
export const pverifyEd25519: TermFn<[ PByteString, PByteString, PByteString ], PBool> =
    addApplications<[ PByteString, PByteString, PByteString ], PBool>(
        new Term(
            fn([ bs, bs, bs ], bool),
            _dbn => Builtin.verifyEd25519Signature
        )
    );


// --------------------------------------------------------------------------------------------------------------------- //
// ----------------------------------------------- [ VASIL (Plutus V2) ] ----------------------------------------------- //
// --------------------------------------------------------------------------------------------------------------------- //


/**
 * performs elliptic curve digital signature verification (ANSI [2005, 2020], Johnson and Menezes)
 * over the secp256k1 curve (see Certicom Research [2010], §2.4.1) and conforms to the interface described in
 * Note 5 of Section A.2. The arguments must have the following sizes:
 * • 𝑘: 64 bytes
 * • 𝑚: 32 bytes
 * • 𝑠: 64 bytes.
 * The ECDSA scheme admits two distinct valid signatures for a given message and private key. We follow
 * the restriction imposed by Bitcoin (see Lau and Wuilie [2016], LOW_S) and only accept the smaller
 * signature: verifyEcdsaSecp256k1Signature will return false if the larger one is supplied.
 * 
 * @param {PByteString} key ```PByteString``` of length 32 ( ```PubKeyHash``` )
 * @param {PByteString} message ```PByteString``` of length 32
 * @param {PByteString} signature ```PByteString``` of length 64
 * @returns {PBool} 
 * 
 * @throws
 * @fails
 */
export const pverifySecp256k1ECDSA: TermFn<[ PByteString, PByteString, PByteString ], PBool> =
addApplications<[ PByteString, PByteString, PByteString ], PBool>(
    new Term(
        fn([ bs, bs, bs ], bool),
        _dbn => Builtin.verifyEcdsaSecp256k1Signature
    )
);

/**
* performs verification of Schnorr signatures ( Schnorr [1989], Lau et al. [2020]) over the secp256k1 curve
* 
* @param {PByteString} key ```PByteString``` of length 64
* @param {PByteString} message abitrary length ```PByteString```
* @param {PByteString} signature ```PByteString``` of length 64
* @returns {PBool} 
* 
* @throws
* @fails
*/
export const pverifySecp256k1Schnorr: TermFn<[ PByteString, PByteString, PByteString ], PBool> =
addApplications<[ PByteString, PByteString, PByteString ], PBool>(
    new Term(
        fn([ bs, bs, bs ], bool),
        _dbn => Builtin.verifySchnorrSecp256k1Signature
    )
);