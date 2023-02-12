import { Machine } from "../../../../../CEK";
import { pmatch } from "../../../../PTypes/PStruct/pmatch";
import { pair, data, int, bs, map, dynPair, list } from "../../../../Term/Type/base";
import { PAddress } from "../../Address/PAddress";
import { PCredential } from "../../Address/PCredential";
import { PStakingCredential } from "../../Address/PStakingCredential";
import { PExtended } from "../../Interval/PExtended";
import { PLowerBound } from "../../Interval/PLowerBound";
import { PUpperBound } from "../../Interval/PUpperBound";
import { PDCert } from "../../PDCert";
import { PPubKeyHash } from "../../PubKey/PPubKeyHash";
import { PDatumHash } from "../../ScriptsHashes/PDatumHash";
import { PValidatorHash } from "../../ScriptsHashes/PValidatorHash";
import { PPOSIXTimeRange, PPOSIXTime } from "../../Time";
import { PTxId } from "../../Tx/PTxId";
import { PTxInInfo } from "../../Tx/PTxInInfo";
import { PTxOut } from "../../Tx/PTxOut";
import { PTxOutRef } from "../../Tx/PTxOutRef";
import { PAssetsEntryT, PValue, PValueEntryT } from "../../Value/PValue";
import { PScriptContext } from "../PScriptContext";
import { PScriptPurpose } from "../PScriptPurpose";
import { PTxInfo } from "../PTxInfo/PTxInfo";
import { UPLCConst } from "../../../../../UPLC/UPLCTerms/UPLCConst";
import { pInt } from "../../../../lib/std/int/pInt";
import { pByteString } from "../../../../lib/std/bs/pByteString";
import { pList } from "../../../../lib/std/list/const";
import { PMaybe } from "../../../../lib/std/PMaybe/PMaybe";
import { pBool } from "../../../../lib/std/bool/pBool";
import { pPair, perror, pisEmpty } from "../../../../lib";
import { PCurrencySymbol } from "../../Value/PCurrencySymbol";
import { PTokenName } from "../../Value/PTokenName";
import { showUPLC } from "../../../../../UPLC/UPLCTerm";
import { pdynPair } from "../../../../lib/std/pair/pdynPair";
import { ErrorUPLC } from "../../../../../UPLC/UPLCTerms/ErrorUPLC";


const unitDatumHash = PDatumHash.from( pByteString("923918e403bf43c34b4ef6b48eb2ee04babed17320d8d1b9ff9ad086e86f44ec") );
const emptyValue = PValue.from( pList( PValueEntryT )([]) as any );

const validatorSpendingUtxo = PTxOutRef.PTxOutRef({
    id: PTxId.PTxId({
        txId: pByteString("deadbeef")
    }),
    index: pInt( 0 )
});

const beef32 = PValue.from(
    pList( PValueEntryT )([
        pdynPair( PCurrencySymbol.type, list( PAssetsEntryT ) )
        (
            PCurrencySymbol.from( pByteString("deadbeef") ),
            pList( PAssetsEntryT )([
                pdynPair( PTokenName.type, int )
                (
                    PTokenName.from( pByteString("beef") ),
                    pInt( 32 )
                )
            ])
        )
    ])
);

const _txInfo = PTxInfo.PTxInfo({
    datums: pList( pair( PDatumHash.type, data ) )([]),
    dCertificates: pList( PDCert.type )([]),
    fee: emptyValue,
    mint: emptyValue,
    id: PTxId.PTxId({
        txId: pByteString("deadbeef")
    }),
    interval: PPOSIXTimeRange.PInterval({
        from: PLowerBound( PPOSIXTime.type ).PLowerBound({
            bound: PExtended( PPOSIXTime.type ).PFinite({ _0: PPOSIXTime.from( pInt(1) ) }),
            inclusive: pBool( false )
        }),
        to: PUpperBound( PPOSIXTime.type ).PUpperBound({
            bound: PExtended( PPOSIXTime.type ).PPosInf({}),
            inclusive: pBool( false )
        })
    }),
    signatories: pList( PPubKeyHash.type )([]),
    withdrawals: pList( pair( PStakingCredential.type, int ) )([]),
    inputs: pList( PTxInInfo.type )([
        PTxInInfo.PTxInInfo({
            utxoRef: validatorSpendingUtxo,
            resolved: PTxOut.PTxOut({
                address: PAddress.PAddress({
                    credential: PCredential.PScriptCredential({
                        valHash: PValidatorHash.from( pByteString("caffee") )
                    }),
                    stakingCredential: PMaybe( PStakingCredential.type ).Nothing({})
                }),
                datumHash: PMaybe( PDatumHash.type ).Just({ val: unitDatumHash }),
                value: beef32
            })
        })
    ]),
    outputs: pList( PTxOut.type )([])
});

const _purp = PScriptPurpose.Spending({
    utxoRef: validatorSpendingUtxo
});

const ctx = PScriptContext.PScriptContext({
    txInfo: _txInfo,
    purpose: _purp
});

describe("pmatch( <PScriptContext> )", () => {

    test("extract txInfo", () => {

        expect(
            Machine.evalSimple(
                pmatch( ctx )
                .onPScriptContext(
                    rawCtxFields => rawCtxFields.extract("txInfo").in( ({txInfo}) => txInfo )
                )
            )
        ).toEqual(
            Machine.evalSimple(
                _txInfo
            )
        );

    });

    test("extract txInfo and purpose", () => {

        expect(
            Machine.evalSimple(
                pmatch( ctx )
                .onPScriptContext(
                    rawCtxFields => rawCtxFields.extract("txInfo","purpose").in( ({txInfo}) => txInfo )
                )
            )
        ).toEqual(
            Machine.evalSimple(
                _txInfo
            )
        );

        expect(
            Machine.evalSimple(
                pmatch( ctx )
                .onPScriptContext(
                    rawCtxFields => rawCtxFields.extract("purpose","txInfo").in( ({txInfo}) => txInfo )
                )
            )
        ).toEqual(
            Machine.evalSimple(
                _txInfo
            )
        );

        expect(
            Machine.evalSimple(
                pmatch( ctx )
                .onPScriptContext(
                    rawCtxFields => rawCtxFields.extract("txInfo","purpose").in( ({purpose}) => purpose )
                )
            )
        ).toEqual(
            Machine.evalSimple(
                _purp
            )
        );

        expect(
            Machine.evalSimple(
                pmatch( ctx )
                .onPScriptContext(
                    rawCtxFields => rawCtxFields.extract("purpose","txInfo").in( ({purpose}) => purpose )
                )
            )
        ).toEqual(
            Machine.evalSimple(
                _purp
            )
        );

    });

    describe("extract fee", () => {

        test("inputs extracted", () => {
            expect(
                Machine.evalSimple(
                    pmatch( ctx )
                    .onPScriptContext( _ => _.extract("txInfo").in( ({ txInfo }) =>
                    txInfo.extract("inputs").in( ({ inputs }) => pisEmpty.$( inputs.tail ) )
                    ))
                )
            ).toEqual(
                Machine.evalSimple(
                    pBool( true )
                )
            )
        });

        test("outputs extracted", () => {

            const term = pmatch( ctx )
            .onPScriptContext( _ => _.extract("txInfo").in( ({ txInfo }) =>
            txInfo.extract("outputs").in( ({ outputs }) => pisEmpty.$( outputs ) )
            ));

            expect(
                Machine.evalSimple(
                    term
                )
            ).toEqual(
                Machine.evalSimple(
                    pBool( true )
                )
            )

        })

        test("interval lower bound extracted", () => {

            expect(
                Machine.evalSimple(
                    pmatch( ctx )
                    .onPScriptContext( _ => _.extract("txInfo").in( ({ txInfo }) =>
                    txInfo.extract("interval").in( ({ interval }) =>
                    interval.extract("from").in( ({ from }) =>
                    from.extract("bound").in( ({ bound }) => 

                    pmatch( bound )
                    .onPFinite( _ => _.extract("_0").in( ({ _0 }) => _0 ))
                    ._( _ => perror( PPOSIXTime.type ) )
                    )))))
                )
            ).toEqual(
                Machine.evalSimple(
                    pInt( 1 )
                )
            )

        });
    
        test("extract input value", () => {
            expect(
                Machine.evalSimple(
                    pmatch( ctx )
                    .onPScriptContext( _ => _.extract("txInfo").in( ({ txInfo }) =>

                        txInfo.extract("inputs").in( ({ inputs }) =>

                        inputs.head.extract("resolved").in( ({ resolved: input }) => 

                        input.extract("value").in( ({value}) => value )
                        
                    ))))
                )
            ).toEqual(
                Machine.evalSimple(
                    beef32
                )
            )
        })

        test("txId (last field)", () => {

            const result = Machine.evalSimple(
                pmatch( ctx )
                .onPScriptContext( _ => _.extract("txInfo").in( ({ txInfo }) => txInfo ))
            );

            /*
            console.log(
                showUPLC(
                    pmatch( ctx )
                    .onPScriptContext( _ => _.extract("txInfo").in( ({ txInfo }) => txInfo ))
                    .toUPLC(0)
                )
            );
            //*/

            expect(
                result instanceof ErrorUPLC
            ).toEqual(
                false
            )

        })
    })

    describe("match Purpose", () => {

        test("all continuations", () => {
            
            expect(
                Machine.evalSimple(
                    pmatch( _purp )
                    .onMinting( _ => pInt( 1 ) )
                    .onSpending( _ => pInt( 2 ) )
                    .onRewarding( _ => pInt( 3 ) )
                    .onCertifying( _ => pInt( 4 ) )
                )
            ).toEqual(
                UPLCConst.int( 2 )
            )

        })

        test("only mint ( purpose is Spending )", () => {
            
            expect(
                Machine.evalSimple(
                    pmatch( _purp )
                    .onMinting( _ => pInt( 1 ) )
                    ._( _ => pInt( 2 ) )
                )
            ).toEqual(
                UPLCConst.int( 2 )
            );

        })

        test("only spend ( purpose is Spending )", () => {
            
            expect(
                Machine.evalSimple(
                    pmatch( _purp )
                    .onSpending( _ => pInt( 1 ) )
                    ._( _ => pInt( 2 ) )
                )
            ).toEqual(
                UPLCConst.int( 1 )
            );

        })

    })

})