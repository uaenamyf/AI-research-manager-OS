package com.researchos.config;

import com.researchos.dto.AiTaskMessage;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * RabbitMQ 配置：exchange、queue、binding。
 * 对应 Implementation/70-async-mq.md。
 *
 * @author myf
 * @since 2026-07-08
 */
@Configuration
public class RabbitConfig {

    public static final String EXCHANGE_AI_TASK = "researchos.ai.task";
    public static final String QUEUE_PAPER_ANALYZE = "q.paper.analyze";
    public static final String QUEUE_REVIEW_GENERATE = "q.review.generate";
    public static final String ROUTING_PAPER_ANALYZE = "paper.analyze";
    public static final String ROUTING_REVIEW_GENERATE = "review.generate";

    public static final String EXCHANGE_DLQ = "researchos.ai.dlx";
    public static final String QUEUE_DLQ = "q.ai.dlq";

    @Bean
    public DirectExchange aiTaskExchange() {
        return new DirectExchange(EXCHANGE_AI_TASK, true, false);
    }

    @Bean
    public Queue paperAnalyzeQueue() {
        return QueueBuilder.durable(QUEUE_PAPER_ANALYZE)
                .withArgument("x-dead-letter-exchange", EXCHANGE_DLQ)
                .withArgument("x-dead-letter-routing-key", QUEUE_DLQ)
                .build();
    }

    @Bean
    public Queue reviewGenerateQueue() {
        return QueueBuilder.durable(QUEUE_REVIEW_GENERATE)
                .withArgument("x-dead-letter-exchange", EXCHANGE_DLQ)
                .withArgument("x-dead-letter-routing-key", QUEUE_DLQ)
                .build();
    }

    @Bean
    public Binding paperAnalyzeBinding() {
        return BindingBuilder.bind(paperAnalyzeQueue())
                .to(aiTaskExchange())
                .with(ROUTING_PAPER_ANALYZE);
    }

    @Bean
    public Binding reviewGenerateBinding() {
        return BindingBuilder.bind(reviewGenerateQueue())
                .to(aiTaskExchange())
                .with(ROUTING_REVIEW_GENERATE);
    }

    // ===== DLQ =====
    @Bean
    public DirectExchange dlqExchange() {
        return new DirectExchange(EXCHANGE_DLQ, true, false);
    }

    @Bean
    public Queue dlqQueue() {
        return QueueBuilder.durable(QUEUE_DLQ).build();
    }

    @Bean
    public Binding dlqBinding() {
        return BindingBuilder.bind(dlqQueue()).to(dlqExchange()).with(QUEUE_DLQ);
    }

    // ===== Template =====
    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(jsonMessageConverter());
        return template;
    }
}
