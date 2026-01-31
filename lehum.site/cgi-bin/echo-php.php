<?php
// Echo back what it received
$method = $_SERVER['REQUEST_METHOD'];
$body = file_get_contents('php://input');
$data = [];

$contentType = isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : (isset($_SERVER['HTTP_CONTENT_TYPE']) ? $_SERVER['HTTP_CONTENT_TYPE'] : '');

if ($method === 'GET') {
    $data = $_GET;
} else {
    if (strpos($contentType, 'application/json') !== false) {
        $data = json_decode($body, true);
    } else {
        if ($method === 'POST') {
             $data = $_POST;
        } else {
             parse_str($body, $data);
        }
    }
}

// Polyfill for getallheaders if needed
if (!function_exists('getallheaders')) {
    function getallheaders() {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) == 'HTTP_') {
                $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
            }
        }
        return $headers;
    }
}

$response = [
    'received' => [
        'method' => $method,
        'headers' => getallheaders(),
        'body' => $data,
        'raw_body' => $body
    ],
    'meta' => [
        'hostname' => $_SERVER['SERVER_NAME'],
        'date' => date('Y-m-d H:i:s'),
        'ip' => $_SERVER['REMOTE_ADDR'],
        'user_agent' => $_SERVER['HTTP_USER_AGENT']
    ]
];

header('Content-Type: application/json');
echo json_encode($response, JSON_PRETTY_PRINT);
?>
