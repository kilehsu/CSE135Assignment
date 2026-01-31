<?php
header('Content-Type: text/plain');
foreach ($_SERVER as $key => $value) {
    echo "$key=$value\n";
}
?>
