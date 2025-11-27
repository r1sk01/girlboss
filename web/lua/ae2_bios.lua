-- AE2 OpenComputers BIOS Script
-- This script should be flashed to the computer's BIOS
-- It downloads and executes the main AE2 management script

local component = require("component")
local computer = require("computer")
local internet = require("internet")
local filesystem = require("filesystem")

-- Configuration
local SERVER_URL = "ws://localhost:3000" -- Change this to your server URL
local SCRIPT_URL = SERVER_URL:gsub("ws://", "http://") .. "/api/ae2/script.lua"
local AE2_TOKEN = nil -- Will be set as boot argument

-- Function to log messages
local function log(message)
    print("[AE2-BIOS] " .. message)
end

-- Function to check if required components are available
local function checkComponents()
    log("Checking required components...")

    -- Check for internet card
    if not component.isAvailable("internet") then
        log("ERROR: Internet card not found!")
        return false
    end

    -- Check for ME Controller
    if not component.isAvailable("me_controller") then
        log("ERROR: ME Controller not found!")
        return false
    end

    -- Check for computer
    if not component.isAvailable("computer") then
        log("ERROR: Computer component not available!")
        return false
    end

    log("All required components found!")
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
    local me = component.me_controller
    local info = {
        address = me.address,
        energy = me.getEnergyStored(),
        maxEnergy = me.getMaxEnergyStored(),
        avgPowerUsage = me.getAvgPowerUsage(),
        maxPowerUsage = me.getMaxPowerUsage()
    }

    -- Try to get crafting CPUs
    local success, cpus = pcall(me.getCraftingCPUs)
    if success then
        info.craftingCPUs = cpus
    end

    return info
end

-- Function to download the main script
local function downloadScript(url)
    log("Downloading main script from: " .. url)

    local handle = internet.request(url)
    if not handle then
        log("ERROR: Failed to create HTTP request")
        return nil
    end

    local result = ""
    local chunk = ""

    repeat
        chunk = handle.read(math.huge)
        if chunk then
            result = result .. chunk
        end
    until not chunk

    handle.close()

    if result == "" then
        log("ERROR: Downloaded script is empty")
        return nil
    end

    log("Script downloaded successfully (" .. #result .. " bytes)")
    return result
end

-- Function to save script to filesystem
local function saveScript(content, path)
    local file = io.open(path, "w")
    if not file then
        log("ERROR: Cannot create file: " .. path)
        return false
    end

    file:write(content)
    file:close()
    log("Script saved to: " .. path)
    return true
end

-- Main execution function
local function main()
    log("AE2 OpenComputers BIOS starting...")

    -- Get token from boot arguments
    local args = {...}
    if #args > 0 then
        AE2_TOKEN = args[1]
        log("Using token from arguments: " .. AE2_TOKEN)
    else
        log("ERROR: No AE2 token provided as argument!")
        log("Usage: ae2_bios.lua <token>")
        return
    end

    -- Check components
    if not checkComponents() then
        log("Component check failed. Exiting.")
        return
    end

    -- Get system information
    local computerInfo = getComputerInfo()
    local ae2Info = getAE2Info()

    log("Computer Address: " .. computerInfo.address)
    log("ME Controller Address: " .. ae2Info.address)
    log("AE2 Energy: " .. ae2Info.energy .. "/" .. ae2Info.maxEnergy)

    -- Download main script
    local scriptContent = downloadScript(SCRIPT_URL)
    if not scriptContent then
        log("Failed to download main script. Exiting.")
        return
    end

    -- Save script to filesystem
    local scriptPath = "/tmp/ae2_main.lua"
    if not saveScript(scriptContent, scriptPath) then
        log("Failed to save script. Exiting.")
        return
    end

    -- Load and execute the main script
    log("Loading main AE2 script...")
    local scriptFunc, loadError = loadfile(scriptPath)
    if not scriptFunc then
        log("ERROR: Failed to load script: " .. (loadError or "unknown error"))
        return
    end

    -- Execute main script with token and system info
    log("Starting main AE2 script...")
    local success, error = pcall(scriptFunc, AE2_TOKEN, computerInfo, ae2Info, SERVER_URL)
    if not success then
        log("ERROR: Main script execution failed: " .. (error or "unknown error"))
    end

    log("AE2 BIOS execution completed.")
end

-- Run main function
main()
