# Girlboss

A swiss army knife for Signal messenger.

## Running your own Girlboss instance

Note: Your instance will not sync with main Girlboss and requires a separate phone number to setup the Signal account it uses  

Please setup signal-cli beforehand, and store the config folder in an easy-to-access location.

To setup Girlboss, start by running `cp ./config.jsonc.template ./config.jsonc`, then open `config.jsonc`, read the instructions and fill out all the necessary fields.  
Once you're done, run `bun install --frozen-lockfile`, then run `bun run start` to start the bot.  
From there, you can configure the bot in any way you like, alongside add new modules or commands in pre-existing modules by going into the `commands` folder (feel free to use one of the default modules as a base for your new modules).  
There is also a `docker-compose.yaml` for those of you who are sensible with app security or just want an easy setup.  
