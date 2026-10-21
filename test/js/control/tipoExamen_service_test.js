import * as chai from "../lib/chai/index.js";
import TipoExamenService from "../../../src/js/control/tipoExamen_service.js";
import sinon from "../lib/sinon/sinon-esm.js";
mocha.setup("tdd");
var stubfetch = sinon.stub(window, "fetch").resolves(
  new Response(
    JSON.stringify([
      {
        activo: true,
        idTipoExamen: "9acfb0dd-c3a5-41b0-bb12-4323aba283e8",
        nombre: "Hemologia",
        observaciones: "",
      },
      {
        activo: true,
        idTipoExamen: "68cec252-59f5-474f-bb7e-5e550af733f3",
        nombre: "Análisis Coproparasitario",
        observaciones: "",
      }
    ]),
    { status: 200, headers: new Headers({ "Total-registros": "2" }) },
  ),
);

suite("TipoExamenService", function () {
  test("TipoExamenService deberia retornar un DefaultResponse con los datos correctos", function (done) {
    let service = new TipoExamenService();
    service.findRange(0, 10).then((resp) => {
        chai.expect(resp).to.be.an.instanceof(Object);
        chai.expect(resp.datos).to.be.an('array').that.has.lengthOf(2);
        chai.expect(resp.totalDatos).to.equal('2');
        stubfetch.restore();
        done();
      })
      .catch((err) => {
        done(err);
      });
  });
});

mocha.run();
