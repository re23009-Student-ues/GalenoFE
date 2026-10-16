console.log(this);
function funcionTradicional() {
  console.log(this);
}

class ClaseTradicional {
    contructor(){
        console.log(this);
        this.texto="hola mundo";
        this.numero=(1,2,3,4);
    }

    metodoTradicional(){
        console.log(this);
    }

    metodoTradicionaliterar(){

        this.numero.forEach((numero) => {
            console.log(this.texto, numero);
        });
    }

}

console.log(this);
funcionTradicional();
let instancia = new ClaseTradicional();
instancia.metodoTradicional();
instancia.metodoTradicionaliterar();
