<?php
// ============================================================================
// API PARA TESTING DE FLUJOS CONVERSACIONALES
// ============================================================================
// Permite testear conversaciones sin enviar WhatsApp real
// ============================================================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once '../../bd/conexion.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Solo se permite método POST']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'JSON inválido']);
    exit;
}

$template_name = $input['template_name'] ?? '';
$client_message = $input['client_message'] ?? '';
$session_id = $input['session_id'] ?? null;

if (empty($template_name) || empty($client_message)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'template_name y client_message son requeridos']);
    exit;
}

try {
    // Simular el flujo completo del ConversationEngine pero sin enviar WhatsApp
    
    // 1. Buscar o crear sesión conversacional de prueba
    $session = getOrCreateTestSession($conexion, $session_id, $template_name);
    
    // 2. Obtener posibles pasos siguientes
    $possible_steps = getPossibleNextSteps($conexion, $session);
    
    // 3. Encontrar mejor coincidencia
    $best_match = findBestStepMatch($possible_steps, $client_message);
    
    if (!$best_match) {
        echo json_encode([
            'success' => true,
            'session_id' => $session['id'],
            'step_name' => 'FALLBACK',
            'step_id' => null,
            'match_score' => 0,
            'response_type' => 'generic_ai',
            'response_text' => 'No se encontró un paso específico para esta consulta. Un representante puede ayudarte mejor.',
            'should_escalate' => true,
            'escalation_reason' => 'No hay flujo configurado para esta consulta',
            'debug_info' => [
                'possible_steps_count' => count($possible_steps),
                'current_step_id' => $session['current_step_id'],
                'template_name' => $template_name
            ]
        ]);
        exit;
    }
    
    // 4. Generar respuesta según tipo
    $response = generateTestResponse($best_match, $session, $client_message);
    
    // 5. Actualizar sesión de prueba
    updateTestSession($conexion, $session, $best_match, $client_message, $response);
    
    echo json_encode([
        'success' => true,
        'session_id' => $session['id'],
        'step_name' => $best_match['step_name'],
        'step_id' => $best_match['id'],
        'match_score' => $best_match['match_score'],
        'response_type' => $best_match['response_type'],
        'response_text' => $response,
        'should_escalate' => (bool)$best_match['requires_human_fallback'],
        'escalation_reason' => $best_match['requires_human_fallback'] ? "Escalamiento automático desde paso: {$best_match['step_name']}" : null,
        'debug_info' => [
            'possible_steps_count' => count($possible_steps),
            'current_step_id' => $session['current_step_id'],
            'template_name' => $template_name,
            'keywords_matched' => json_decode($best_match['trigger_keywords'] ?? '[]', true)
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

// ============================================================================
// FUNCIONES AUXILIARES (Simulan ConversationEngine)
// ============================================================================

function getOrCreateTestSession($conexion, $session_id, $template_name) {
    if ($session_id) {
        // Buscar sesión existente
        $stmt = $conexion->prepare("
            SELECT * FROM conversation_sessions 
            WHERE id = ? AND template_name = ?
        ");
        $stmt->bind_param("is", $session_id, $template_name);
        $stmt->execute();
        $result = $stmt->get_result();
        
        if ($session = $result->fetch_assoc()) {
            return $session;
        }
    }
    
    // Crear nueva sesión de prueba
    $stmt = $conexion->prepare("
        INSERT INTO conversation_sessions (
            session_id, template_name, conversation_state, 
            step_history, messages_in_flow, expires_at
        ) VALUES (?, ?, 'active', JSON_ARRAY(), 0, DATE_ADD(NOW(), INTERVAL 1 HOUR))
    ");
    $test_session_id = 999999; // ID especial para testing
    $stmt->bind_param("is", $test_session_id, $template_name);
    $stmt->execute();
    
    $new_id = $conexion->insert_id;
    
    $stmt = $conexion->prepare("SELECT * FROM conversation_sessions WHERE id = ?");
    $stmt->bind_param("i", $new_id);
    $stmt->execute();
    
    return $stmt->get_result()->fetch_assoc();
}

function getPossibleNextSteps($conexion, $session) {
    if (!$session['current_step_id']) {
        // Primera interacción: buscar paso inicial
        $stmt = $conexion->prepare("
            SELECT * FROM conversation_flows 
            WHERE template_name = ? AND step_number = 1 AND is_active = TRUE
            ORDER BY trigger_priority DESC
        ");
        $stmt->bind_param("s", $session['template_name']);
    } else {
        // Interacciones posteriores: buscar pasos hijos
        $stmt = $conexion->prepare("
            SELECT * FROM conversation_flows 
            WHERE parent_step_id = ? AND is_active = TRUE
            ORDER BY trigger_priority DESC
        ");
        $stmt->bind_param("i", $session['current_step_id']);
    }
    
    $stmt->execute();
    $result = $stmt->get_result();
    $steps = [];
    
    while ($row = $result->fetch_assoc()) {
        $steps[] = $row;
    }
    
    return $steps;
}

function findBestStepMatch($possible_steps, $client_message) {
    $message_text = strtolower(trim($client_message));
    $best_match = null;
    $highest_score = 0;
    
    foreach ($possible_steps as $step) {
        $score = calculateStepMatchScore($step, $message_text);
        
        if ($score > $highest_score) {
            $highest_score = $score;
            $best_match = $step;
            $best_match['match_score'] = $score;
        }
    }
    
    // Solo retornar si supera umbral mínimo
    if ($best_match && $highest_score > 0) {
        return $best_match;
    }
    
    // Si no hay buena coincidencia, tomar el primer paso como fallback
    if (!empty($possible_steps)) {
        $fallback = $possible_steps[0];
        $fallback['match_score'] = 0.1; // Score bajo para fallback
        return $fallback;
    }
    
    return null;
}

function calculateStepMatchScore($step, $message_text) {
    if (!$step['trigger_keywords']) return 0;
    
    $keywords = json_decode($step['trigger_keywords'], true);
    if (!$keywords) return 0;
    
    $total_score = 0;
    $match_count = 0;
    
    foreach ($keywords as $keyword) {
        if ($keyword === '*') {
            return 0.1; // Wildcard match
        }
        
        $keyword_lower = strtolower($keyword);
        
        if ($step['trigger_exact_match']) {
            if ($message_text === $keyword_lower) {
                $total_score += 1.0;
                $match_count++;
            }
        } else {
            if (strpos($message_text, $keyword_lower) !== false) {
                $specificity = strlen($keyword_lower) / strlen($message_text);
                $total_score += min($specificity * 2, 1.0);
                $match_count++;
            }
        }
    }
    
    if ($match_count === 0) {
        return 0;
    }
    
    $normalized_score = $total_score / count($keywords);
    $priority_bonus = ($step['trigger_priority'] ?? 1) * 0.01;
    
    return min($normalized_score + $priority_bonus, 1.0);
}

function generateTestResponse($step, $session, $client_message) {
    switch ($step['response_type']) {
        case 'fixed':
            return $step['response_text'];
            
        case 'ai_assisted':
            // Para testing, simular respuesta IA pero usar template como base
            return $step['response_text'] . " (respuesta AI-assisted simulada)";
            
        case 'escalate_human':
            return $step['response_text'];
            
        default:
            return $step['response_text'];
    }
}

function updateTestSession($conexion, $session, $step, $client_message, $response) {
    // Actualizar sesión con nuevo paso
    $stmt = $conexion->prepare("
        UPDATE conversation_sessions 
        SET current_step_id = ?, 
            messages_in_flow = messages_in_flow + 1,
            last_interaction_at = NOW()
        WHERE id = ?
    ");
    $stmt->bind_param("ii", $step['id'], $session['id']);
    $stmt->execute();
}
?>