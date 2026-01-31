<?php
header('Content-Type: application/json');
$response = [
    'message' => 'Hello PHP World',
    'language' => 'PHP',
    'date' => date('Y-m-d H:i:s'),
    'ip' => $_SERVER['REMOTE_ADDR'],
    'team' => ['Aaron Chiuwei', 'Kile Hsu', 'Varun Sharma']
];
echo json_encode($response);
?>
