<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="UTF-8" />
    
    <!--
      ****************************************************************
      A CORREÇÃO ESTÁ AQUI (Passo 18 - A Causa Raiz)
      
      Esta linha diz ao celular para não "dar zoom out"
      e para usar a largura total da tela. Isso vai
      eliminar o espaço em branco na lateral.
      ****************************************************************
    -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
    <title>Agenda de Músicos</title>
    
    <!-- 
      Scripts que você (Implementador) adicionou.
      Eles estão corretos e devem ficar aqui.
    -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  </head>
  
  <body>
    <!-- O React vai injetar o app aqui -->
    <div id="root"></div>
    
    <!-- O script principal do seu projeto Vite -->
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
