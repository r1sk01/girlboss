local component = require("component")
local computer = require("computer")
local event = require("event")
local internet = require("internet")
local os = require("os")

-- JSON library (since it's not built into Lua)
local json = {}
function json.encode(obj)
    local function escape_str(s)
        s = string.gsub(s, "\\", "\\\\")
        s = string.gsub(s, "\"", "\\\"")
        s = string.gsub(s, "\n", "\\n")
        s = string.gsub(s, "\r", "\\r")
        s = string.gsub(s, "\t", "\\t")
        return s
    end

    local function encode_val(val)
        if type(val) == "string" then
            return '"' .. escape_str(val) .. '"'
        elseif type(val) == "number" then
            return tostring(val)
        elseif type(val) == "boolean" then
            return tostring(val)
        elseif type(val) == "nil" then
            return "null"
        elseif type(val) == "table" then
            local result = {}
            local is_array = true
            for k, v in pairs(val) do
                if type(k) ~= "number" then
                    is_array = false
                    break
                end
            end

            if is_array then
                for i, v in ipairs(val) do
                    table.insert(result, encode_val(v))
                end
                return "[" .. table.concat(result, ",") .. "]"
            else
                for k, v in pairs(val) do
                    table.insert(result, '"' .. escape_str(tostring(k)) .. '":' .. encode_val(v))
                end
                return "{" .. table.concat(result, ",") .. "}"
            end
        else
            return '"' .. escape_str(tostring(val)) .. '"'
        end
    end

    return encode_val(obj)
end

function json.decode(str)
    local pos = 1

    local function skip_whitespace()
        while pos <= #str and string.match(string.sub(str, pos, pos), "%s") do
            pos = pos + 1
        end
    end

    local function decode_val()
        skip_whitespace()
        local char = string.sub(str, pos, pos)

        if char == '"' then
            pos = pos + 1
            local result = ""
            while pos <= #str do
                local c = string.sub(str, pos, pos)
                if c == '"' then
                    pos = pos + 1
                    return result
                elseif c == "\\" then
                    pos = pos + 1
                    local next_char = string.sub(str, pos, pos)
                    if next_char == "n" then
                        result = result .. "\n"
                    elseif next_char == "r" then
                        result = result .. "\r"
                    elseif next_char == "t" then
                        result = result .. "\t"
                    elseif next_char == "\\" then
                        result = result .. "\\"
                    elseif next_char == '"' then
                        result = result .. '"'
                    else
                        result = result .. next_char
                    end
                else
                    result = result .. c
                end
                pos = pos + 1
            end
            error("Unterminated string")
        elseif char == "{" then
            pos = pos + 1
            local result = {}
            skip_whitespace()
            if string.sub(str, pos, pos) == "}" then
                pos = pos + 1
                return result
            end
            while true do
                local key = decode_val()
                skip_whitespace()
                if string.sub(str, pos, pos) ~= ":" then
                    error("Expected :")
                end
                pos = pos + 1
                local value = decode_val()
                result[key] = value
                skip_whitespace()
                local char = string.sub(str, pos, pos)
                if char == "}" then
                    pos = pos + 1
                    return result
                elseif char == "," then
                    pos = pos + 1
                else
                    error("Expected , or }")
                end
            end
        elseif char == "[" then
            pos = pos + 1
            local result = {}
            skip_whitespace()
            if string.sub(str, pos, pos) == "]" then
                pos = pos + 1
                return result
            end
            while true do
                table.insert(result, decode_val())
                skip_whitespace()
                local char = string.sub(str, pos, pos)
                if char == "]" then
                    pos = pos + 1
                    return result
                elseif char == "," then
                    pos = pos + 1
                else
                    error("Expected , or ]")
                end
            end
        elseif string.match(char, "[%-0-9]") then
            local num_str = ""
            while pos <= #str and string.match(string.sub(str, pos, pos), "[%-0-9%.]") do
                num_str = num_str .. string.sub(str, pos, pos)
                pos = pos + 1
            end
            return tonumber(num_str)
        elseif string.sub(str, pos, pos + 3) == "true" then
            pos = pos + 4
            return true
        elseif string.sub(str, pos, pos + 4) == "false" then
            pos = pos + 5
            return false
        elseif string.sub(str, pos, pos + 3) == "null" then
            pos = pos + 4
            return nil
        else
            error("Unexpected character: " .. char)
        end
    end

    return decode_val()
end

-- Get arguments from BIOS script
local AE2_TOKEN = ...

-- Configuration - single WebSocket URL variable
local WS_URL = "ws://tritiumweb.zeusteam.dev/api/ae2/" .. (AE2_TOKEN or "ae2_default_token_12345")

-- Global variables
local ws = nil
local running = true
local lastHeartbeat = 0
local me = nil
local isValidSetup = false

-- Function to log messages
local function log(message)
    print("[AE2-MAIN] " .. message)
end

-- Function to make computer beep
local function beep()
    computer.beep(800, 0.2) -- 800Hz for 0.2 seconds
end

-- Function to safely encode JSON
local function safeJsonEncode(data)
    local success, result = pcall(json.encode, data)
    if success then
        return result
    else
        log("JSON encode error: " .. tostring(result))
        return nil
    end
end

-- Function to safely decode JSON
local function safeJsonDecode(data)
    local success, result = pcall(json.decode, data)
    if success then
        return result
    else
        log("JSON decode error: " .. tostring(result))
        return nil
    end
end

-- Power-on self-test function
local function performPOST()
    log("Performing power-on self-test...")

    -- Check for internet card
    if not component.isAvailable("internet") then
        log("POST FAIL: Internet card not found!")
        beep()
        return false
    end

    -- Check for ME Controller first, then ME Interface as fallback
    local meComponent = nil
    if component.isAvailable("me_controller") then
        meComponent = component.me_controller
        log("POST: Found ME Controller")
    elseif component.isAvailable("me_interface") then
        meComponent = component.me_interface
        log("POST: Found ME Interface (fallback)")
    else
        log("POST FAIL: No ME Controller or ME Interface found!")
        beep()
        return false
    end

    -- Test ME component functionality
    local success, energy = pcall(meComponent.getEnergyStored)
    if not success then
        log("POST FAIL: Cannot access ME energy information!")
        beep()
        return false
    end

    -- Store the working ME component
    me = meComponent
    log("POST: ME system accessible, energy: " .. (energy or "unknown"))

    -- Check basic computer functions
    if not computer.address() then
        log("POST FAIL: Computer address unavailable!")
        beep()
        return false
    end

    log("POST SUCCESS: All systems operational")
    return true
end

-- Function to get computer information
local function getComputerInfo()
    return {
        address = computer.address(),
        totalMemory = computer.totalMemory(),
        freeMemory = computer.freeMemory(),
        energy = computer.energy(),
        maxEnergy = computer.maxEnergy(),
        uptime = computer.uptime()
    }
end

-- Function to get AE2 system information
local function getAE2Info()
    if not me then return nil end

    local info = {
        address = me.address,
        componentType = me.type -- Will be "me_controller" or "me_interface"
    }

    -- Try to get energy information
    local success, energy = pcall(me.getEnergyStored)
    if success then
        info.energy = energy
        local success2, maxEnergy = pcall(me.getMaxEnergyStored)
        if success2 then info.maxEnergy = maxEnergy end
    end

    -- Try to get power usage (ME Controller only)
    if me.type == "me_controller" then
        local success3, avgPower = pcall(me.getAvgPowerUsage)
        if success3 then info.avgPowerUsage = avgPower end
        local success4, maxPower = pcall(me.getMaxPowerUsage)
        if success4 then info.maxPowerUsage = maxPower end

        -- Try to get crafting CPUs
        local success5, cpus = pcall(me.getCraftingCPUs)
        if success5 then info.craftingCPUs = cpus end
    end

    return info
end

-- Function to send WebSocket message
local function sendMessage(msgType, data)
    if not ws then
        log("Cannot send message: WebSocket not connected")
        return false
    end

    local message = {
        type = msgType,
        timestamp = os.time(),
    }

    -- Merge data into message
    if data then
        for k, v in pairs(data) do
            message[k] = v
        end
    end

    local jsonMsg = safeJsonEncode(message)
    if not jsonMsg then
        log("Failed to encode message")
        return false
    end

    local success, error = pcall(ws.write, jsonMsg)
    if not success then
        log("WebSocket write error: " .. tostring(error))
        return false
    end

    return true
end

-- Function to get current AE2 status
local function getAE2Status()
    if not me then return nil end

    local status = {
        componentType = me.type,
        timestamp = os.time()
    }

    -- Get energy info
    local success, energy = pcall(me.getEnergyStored)
    if success then
        status.energy = energy
        local success2, maxEnergy = pcall(me.getMaxEnergyStored)
        if success2 then status.maxEnergy = maxEnergy end
    end

    -- Get additional info for ME Controller
    if me.type == "me_controller" then
        local success3, avgPower = pcall(me.getAvgPowerUsage)
        if success3 then status.avgPowerUsage = avgPower end
        local success4, maxPower = pcall(me.getMaxPowerUsage)
        if success4 then status.maxPowerUsage = maxPower end

        local success5, cpus = pcall(me.getCraftingCPUs)
        if success5 then status.craftingCPUs = cpus end
    end

    -- Get storage info
    local success6, items = pcall(me.getItemsInNetwork)
    if success6 then
        status.itemCount = #items
        status.totalBytes = 0
        for _, item in ipairs(items) do
            if item.size then
                status.totalBytes = status.totalBytes + item.size
            end
        end
    end

    return status
end

-- Function to get inventory snapshot
local function getInventorySnapshot()
    if not me then return nil end

    local success, items = pcall(me.getItemsInNetwork)
    if not success then
        return nil
    end

    local inventory = {}
    for _, item in ipairs(items) do
        table.insert(inventory, {
            name = item.name,
            label = item.label,
            size = item.size,
            damage = item.damage
        })
    end

    return inventory
end

-- Function to handle crafting requests
local function handleCraftRequest(command)
    if not me then
        sendMessage("error", {error = "ME system not available"})
        return
    end

    local itemName = command.item
    local amount = command.amount or 1

    log("Crafting request: " .. amount .. "x " .. itemName)

    -- Get craftables
    local success, craftables = pcall(me.getCraftables)
    if not success then
        sendMessage("error", {error = "Cannot get craftables list"})
        return
    end

    -- Find the item
    local targetItem = nil
    for _, item in ipairs(craftables) do
        if item.name == itemName or (item.label and item.label:lower():find(itemName:lower())) then
            targetItem = item
            break
        end
    end

    if not targetItem then
        sendMessage("error", {error = "Item not found in craftables: " .. itemName})
        return
    end

    -- Request crafting
    local success, result = pcall(targetItem.request, amount)
    if success then
        log("Crafting started successfully")
        sendMessage("craft_request", {
            result = {
                success = true,
                item = itemName,
                amount = amount,
                craftingStarted = true
            }
        })
    else
        log("Crafting failed: " .. tostring(result))
        sendMessage("craft_request", {
            result = {
                success = false,
                item = itemName,
                amount = amount,
                error = tostring(result)
            }
        })
    end
end

-- Function to handle status requests
local function handleStatusRequest()
    local status = getAE2Status()
    if status then
        sendMessage("status", {status = status})
    else
        sendMessage("error", {error = "Failed to get system status"})
    end
end

-- Function to handle inventory requests
local function handleInventoryRequest()
    local inventory = getInventorySnapshot()
    if inventory then
        sendMessage("inventory_update", {inventory = inventory})
    else
        sendMessage("error", {error = "Failed to get inventory"})
    end
end

-- Function to handle incoming WebSocket messages
local function handleMessage(message)
    local data = safeJsonDecode(message)
    if not data then
        log("Received invalid JSON message")
        return
    end

    log("Received message type: " .. (data.type or "unknown"))

    if data.type == "handshake" then
        log("Handshake received, sending authentication...")
        local computerInfo = getComputerInfo()
        local ae2Info = getAE2Info()
        sendMessage("auth", {
            computerInfo = computerInfo,
            ae2Info = ae2Info
        })

    elseif data.type == "auth_success" then
        log("Authentication successful!")
        -- Send initial status
        handleStatusRequest()

    elseif data.type == "auth_error" then
        log("Authentication failed: " .. (data.message or "unknown error"))
        running = false

    elseif data.type == "command" then
        local command = data.command
        if not command then
            sendMessage("error", {error = "No command specified"})
            return
        end

        if command.action == "craft" then
            handleCraftRequest(command)
        elseif command.action == "status" then
            handleStatusRequest()
        elseif command.action == "inventory" then
            handleInventoryRequest()
        elseif command.action == "shutdown" then
            log("Shutdown command received")
            running = false
        elseif command.action == "post" then
            log("Manual POST requested")
            if performPOST() then
                sendMessage("status", {message = "POST successful"})
            else
                sendMessage("error", {error = "POST failed"})
            end
        else
            sendMessage("error", {error = "Unknown command action: " .. (command.action or "none")})
        end

    elseif data.type == "ping" then
        sendMessage("pong", {})

    else
        log("Unknown message type: " .. (data.type or "none"))
    end
end

-- Function to connect to WebSocket
local function connectWebSocket()
    log("Connecting to WebSocket: " .. WS_URL)

    local success, result = pcall(internet.socket, WS_URL)
    if not success then
        log("WebSocket connection failed: " .. tostring(result))
        return false
    end

    ws = result
    log("WebSocket connected successfully!")
    return true
end

-- Function to handle heartbeat
local function handleHeartbeat()
    local currentTime = os.time()
    if currentTime - lastHeartbeat >= HEARTBEAT_INTERVAL then
        if ws and isValidSetup then
            local status = getAE2Status()
            if status then
                sendMessage("status", {status = status})
            end
            lastHeartbeat = currentTime
        end
    end
end

-- Function to cleanup
local function cleanup()
    if ws then
        ws.close()
        ws = nil
    end
    log("Cleanup completed")
end

-- Main loop
local function mainLoop()
    log("Starting AE2 main script...")
    log("Token: " .. (AE2_TOKEN or "not provided"))

    if not AE2_TOKEN then
        log("FATAL ERROR: No AE2 token provided!")
        log("Usage: ae2_compact_bios.lua <token>")
        return
    end

    log("WebSocket URL: " .. WS_URL)

    local lastPOSTCheck = 0

    while running do
        local currentTime = os.time()

        -- Perform POST checks every 5 seconds if not valid
        if not isValidSetup and (currentTime - lastPOSTCheck >= POST_CHECK_INTERVAL) then
            isValidSetup = performPOST()
            lastPOSTCheck = currentTime

            if not isValidSetup then
                -- Wait before next attempt
                os.sleep(1)
                goto continue
            end
        end

        -- Connect if valid setup and not connected
        if isValidSetup and not ws then
            if not connectWebSocket() then
                log("Connection failed, will retry...")
                os.sleep(RECONNECT_DELAY)
                goto continue
            end
        end

        -- Handle incoming messages
        if ws then
            local success, message = pcall(ws.read, 0.1) -- Non-blocking read with 100ms timeout
            if success and message then
                handleMessage(message)
            elseif not success then
                log("WebSocket read error: " .. tostring(message))
                ws = nil -- Force reconnection
            end
        end

        -- Handle heartbeat
        if isValidSetup then
            handleHeartbeat()
        end

        -- Handle computer events (like interrupts)
        local eventType = event.pull(0.1) -- Non-blocking event pull
        if eventType == "interrupted" then
            log("Received interrupt signal")
            running = false
        end

        ::continue::
    end

    cleanup()
    log("AE2 main script terminated")
end

-- Error handling wrapper
local function safeMain()
    local success, error = pcall(mainLoop)
    if not success then
        log("FATAL ERROR: " .. tostring(error))
        beep()
        beep()
        beep() -- Triple beep for fatal errors
        cleanup()
    end
end

-- Start the main loop
safeMain()
