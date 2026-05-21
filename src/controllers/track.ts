import { RequestHandler } from 'express';

import { EmbedBuilder } from 'discord.js';

import { discordService } from '~/services/discord.service';

export const postEventTracking: RequestHandler = async (req, res) => {
  try {
    const { event } = req.params;
    const userId = req.user?.id; // Assuming you have user authentication middleware
    const body = req.body || {};

    const embed = new EmbedBuilder()
      .setTitle('📊 Event Tracking')
      .setColor(0x3498db)
      .addFields(
        { name: 'Event', value: event, inline: true },
        { name: 'User ID', value: userId || 'Not authenticated', inline: true },
      )
      .setTimestamp();

    if (body && typeof body === 'object' && Object.keys(body).length > 0) {
      embed.addFields({
        name: 'Additional Data',
        value: JSON.stringify(body, null, 2),
      });
    }

    // Send directly to Discord using the webhook
    const webhook = discordService['webhookClients'].get('shares');
    if (webhook) {
      await webhook.send({ embeds: [embed] });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending tracking event to Discord:', error);
    res.status(500).json({ success: false, error: 'Failed to track event' });
  }
};
