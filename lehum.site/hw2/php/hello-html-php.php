<?php
header("Cache-Control: no-cache, no-store, must-revalidate");
header("Pragma: no-cache");
header("Expires: 0");
?>
<!DOCTYPE html>
<html>
<head><title>Hello PHP World</title></head>
<body>
    <h1 align="center">Hello PHP World</h1>
    <hr/>
    <p>Hello World</p>
    <p>This page was generated with the PHP programming language</p>
    <p>This program was generated at: <?php echo date('Y-m-d H:i:s'); ?></p>
    <p>Your current IP Address is: <?php echo $_SERVER['REMOTE_ADDR']; ?></p>
    <p>Team Members: Aaron Chiuwei, Kile Hsu, Varun Sharma</p>
</body>
</html>
