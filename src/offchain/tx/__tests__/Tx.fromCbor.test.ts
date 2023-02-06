import { Tx } from "../Tx"

describe("Tx.fromCbor", () => {

    test("parses simple IO tx", () => {

        console.log(
            JSON.stringify(
                Tx.fromCbor(
                    "84a30081825820d11531780938f9fc6110c968b8cd571c3b88aa8981bb52c296090958fe27848f000182825839000456f170a8ee5d0fb93458a394ba3a4d043db096e58c8a1f33a6681dcb15713c952715df00f231200e7a208ddeb718d05fcd34c5f0bfdb801b00000045d952e577825839000456f170a8ee5d0fb93458a394ba3a4d043db096e58c8a1f33a6681dcb15713c952715df00f231200e7a208ddeb718d05fcd34c5f0bfdb801a000f4240021a00029049a0f5f6"
                ).toJson(),
                undefined,
                2
            )
        );

    });

    test.only("parses tx with plutus minting policy", () => {

        console.log(
            JSON.stringify(
                Tx.fromCbor(
                    "84a600818258203ec172510007430a2acf65d1641689d55255e8aa8fa2800482d64aa2bb88caf4000d818258203ec172510007430a2acf65d1641689d55255e8aa8fa2800482d64aa2bb88caf4000182a2005839003a7a52bdf7c9445db07d902333ec5ba94cf012bf8a6586a606824ed37b1f87071222670a5d7504b843fe4038cd677bba7184ce12ca39f7a2011b00000045d9436e39a2005839003a7a52bdf7c9445db07d902333ec5ba94cf012bf8a6586a606824ed37b1f87071222670a5d7504b843fe4038cd677bba7184ce12ca39f7a201821a001e8480a1581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466ea145544f4b454e1a3b9aca00021a0002c54709a1581c919d4c2c9455016289341b1a14dedf697687af31751170d56a31466ea145544f4b454e1a3b9aca000b58204a9be8ef04017d85557512c3b40097344dc0dc3c58a3beaf0cd5ea772f643e95a2068147460100002249810581840100a246636f6e73747200466669656c647380821903201a0002754cf5f6"
                ).toJson(),
                undefined,
                2
            )
        );
    })

});