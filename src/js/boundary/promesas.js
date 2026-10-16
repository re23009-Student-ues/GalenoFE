console.log("antes de la promesa");

let promesa = new Promise((cumplir, fallar) => {
    setTimeout(() => {
        if(Math.random() > 0.5()){
            cumplir("se cumplio la promesa");
        }else{
            fallar("no se cumplio la promesa");
        }
    }, 2000);
});
console.log("despues de la promesa");

promesa.then(e=>{
    console.log("manejo la promesa cumplida", e);
    
}).catch(error=>{
    console.log("rechazo la promesa");
    
}).finally(_ => {
    console.log("siempre se ejecuta despues de la promesa");
})

console.log("fin del script");


