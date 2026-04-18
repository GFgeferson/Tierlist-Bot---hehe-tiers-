'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

class CommandFactory {
    buildCommands() {
        return [
            new SlashCommandBuilder()
                .setName('postar-fila')
                .setDescription('Posta a embed principal da fila'),

            new SlashCommandBuilder()
                .setName('ativar-fila')
                .setDescription('Ativa a fila de um tester')
                .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo do tester').setRequired(true)),

            new SlashCommandBuilder()
                .setName('desativar-fila')
                .setDescription('Desativa a fila de um tester (ou todos)')
                .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo para desativar (vazio = todos)')),

            new SlashCommandBuilder()
                .setName('next')
                .setDescription('Puxa o próximo da fila')
                .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo do tester').setRequired(true)),

            new SlashCommandBuilder()
                .setName('round')
                .setDescription('Registra as notas de um round (máx 3 por teste)')
                .addNumberOption(opt => opt.setName('gamesense').setDescription('Nota de Noção de Jogo (0-20)').setRequired(true).setMinValue(0).setMaxValue(20))
                .addNumberOption(opt => opt.setName('mms').setDescription('Nota de MMS (0-20)').setRequired(true).setMinValue(0).setMaxValue(20))
                .addUserOption(opt => opt.setName('player').setDescription('Jogador sendo testado').setRequired(true)),

            new SlashCommandBuilder()
                .setName('result')
                .setDescription('Anuncia o resultado do teste')
                .addUserOption(opt => opt.setName('player').setDescription('Jogador testado').setRequired(true))
                .addRoleOption(opt => opt.setName('tier').setDescription('Cargo de tier que o jogador vai receber').setRequired(true))
                .addStringOption(opt => opt.setName('ign').setDescription('Nickname do jogador no jogo').setRequired(true)),

            new SlashCommandBuilder()
                .setName('fechar')
                .setDescription('Fecha o canal de teste atual'),

            new SlashCommandBuilder()
                .setName('leave')
                .setDescription('Sai da fila de um tester')
                .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo do tester cuja fila deseja sair').setRequired(true)),

            new SlashCommandBuilder()
                .setName('resetar-cooldown')
                .setDescription('Reseta o cooldown de um jogador em uma fila específica')
                .addUserOption(opt => opt.setName('player').setDescription('Jogador').setRequired(true))
                .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo da fila (vazio = reseta tudo)').setRequired(false)),

            new SlashCommandBuilder()
                .setName('blacklist')
                .setDescription('Coloca um jogador na blacklist removendo todos os cargos')
                .addUserOption(opt => opt.setName('player').setDescription('Jogador').setRequired(true))
                .addIntegerOption(opt => opt.setName('dias').setDescription('Duração em dias (0 = permanente)').setRequired(true).setMinValue(0)),

            new SlashCommandBuilder()
                .setName('unblacklist')
                .setDescription('Remove um jogador da blacklist manualmente')
                .addUserOption(opt => opt.setName('player').setDescription('Jogador').setRequired(true)),

            new SlashCommandBuilder()
                .setName('high-round')
                .setDescription('Registra um round do High Test (notas de 10 a 30)')
                .addNumberOption(opt => opt.setName('gamesense').setDescription('Nocao de Jogo (10-30)').setRequired(true).setMinValue(10).setMaxValue(30))
                .addNumberOption(opt => opt.setName('mms').setDescription('MMS (10-30)').setRequired(true).setMinValue(10).setMaxValue(30))
                .addUserOption(opt => opt.setName('player').setDescription('Jogador sendo testado').setRequired(true))
                .addIntegerOption(opt => opt.setName('total-rounds').setDescription('Quantos rounds no total? (1, 2 ou 3)').setRequired(false).addChoices(
                    { name: '1 round', value: 1 },
                    { name: '2 rounds', value: 2 },
                    { name: '3 rounds', value: 3 }
                )),

            new SlashCommandBuilder()
                .setName('high-result')
                .setDescription('Anuncia o resultado do High Test')
                .addUserOption(opt => opt.setName('player').setDescription('Jogador testado').setRequired(true))
                .addRoleOption(opt => opt.setName('tier').setDescription('Cargo de tier a dar').setRequired(true))
                .addStringOption(opt => opt.setName('ign').setDescription('Nickname do jogador no jogo').setRequired(true)),

        ].map(cmd => cmd.toJSON());
    }
}

module.exports = new CommandFactory();