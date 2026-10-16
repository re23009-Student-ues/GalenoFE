let contador=0;

function contar(){
    contador++;
    postMessage(contador);
    setTimeout("contar()",500);
}

contar();

onmessage = function(e){
    contador=e.data;
}

