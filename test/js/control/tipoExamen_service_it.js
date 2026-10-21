import * as chai from "../lib/chai/index.js";
import TipoExamenService from "../../../src/js/control/tipoExamen_service.js";
import DefaultResponse from "../../../src/js/entity/default_response.js";
mocha.setup("bdd");
describe("TipoExamenService", function () {
  var cut;
  it("should have an instance to test", function () {
    cut = new TipoExamenService();
    chai.assert.isDefined(cut);
    chai.expect(cut).to.be.an.instanceof(TipoExamenService);
  });

  it("findRange should return a DefaultResponse with the correct data", function (done) {
    cut.findRange(0, 10).then((resp) => {
      chai.expect(resp).to.be.an.instanceof(DefaultResponse);
      chai.expect(resp.datos).to.be.an("array").that.has.lengthOf(3);
      chai.expect(resp.totalDatos).to.equal("3");
      done();
    }).catch(err=>{
        done(err);
    });
  });
});

mocha.run();
