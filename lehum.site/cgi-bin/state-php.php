<?php
session_start();

if (isset($_POST['clear'])) {
    session_unset();
    session_destroy();
    session_start();
}

if (isset($_POST['name'])) {
    $_SESSION['name'] = $_POST['name'];
}

$name = isset($_SESSION['name']) ? $_SESSION['name'] : 'Guest';
?>
<!DOCTYPE html>
<html>
<head><title>Session PHP</title></head>
<body>
    <h1>Session Test (PHP)</h1>
    <p>Hello, <?php echo htmlspecialchars($name); ?>!</p>
    
    <form method="POST">
        <label>Enter Name: <input type="text" name="name"></label>
        <button type="submit">Save</button>
    </form>
    <br>
    <form method="POST">
        <input type="hidden" name="clear" value="1">
        <button type="submit">Clear Session</button>
    </form>
    <br>
    <a href="state-php.php">Refresh Page</a>
</body>
</html>
